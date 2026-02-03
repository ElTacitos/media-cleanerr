import { RadarrClient } from "./radarr";
import { SonarrClient } from "./sonarr";
import { QBitClient } from "./qbittorrent";
import { JellyfinClient } from "./jellyfin";
import path from "path";

export class MatcherService {
    private radarr: RadarrClient;
    private sonarr: SonarrClient;
    private qbit: QBitClient;
    private jellyfin: JellyfinClient;

    constructor() {
        this.radarr = new RadarrClient();
        this.sonarr = new SonarrClient();
        this.qbit = new QBitClient();
        this.jellyfin = new JellyfinClient();
    }

    private _format_bytes(bytes: number): string {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }

    private _format_seed_time(seconds: number): string {
        const weeks = Math.floor(seconds / (7 * 24 * 3600));
        const days = Math.floor((seconds % (7 * 24 * 3600)) / (24 * 3600));
        const hours = Math.floor((seconds % (24 * 3600)) / 3600);

        if (weeks > 0) return `${weeks}w ${days}d`;
        if (days > 0) return `${days}d ${hours}h`;
        return `${hours}h`;
    }

    async get_aggregated_media(config: any = null) {
        if (!config) {
            config = {
                disk_threshold: 90,
                min_seed_weeks: 4,
                min_ratio: 1.0,
            };
        }

        console.info(`Starting media sync with config:`, config);

        const disk_usage = await this.get_disk_usage();
        const current_disk_percent = disk_usage?.percent || 0;
        const is_disk_full_check = current_disk_percent >= parseFloat(config.disk_threshold || 90);

        // 1. Fetch data
        const [radarr_movies, radarr_history, sonarr_series, sonarr_history, qbit_torrents, jf_data] = await Promise.all([this.radarr.get_movies(), this.radarr.get_history(10000), this.sonarr.get_series(), this.sonarr.get_history(10000), this.qbit.get_torrents(), this.jellyfin.get_all_items_with_play_status()]);

        console.info(`Fetched ${radarr_history.length} history records from Radarr.`);
        console.info(`Fetched ${sonarr_history.length} history records from Sonarr.`);
        console.info(`Fetched ${qbit_torrents.length} torrents from qBittorrent.`);

        // Index torrents by hash
        const torrents_by_hash: Record<string, any> = {};
        for (const t of qbit_torrents) {
            if (t.hash) torrents_by_hash[t.hash.toLowerCase()] = t;
        }

        // Index Radarr history hashes by MovieId
        const radarr_hashes: Record<number, Set<string>> = {};
        for (const record of radarr_history) {
            const m_id = record.movieId;
            const d_id = record.downloadId;
            if (m_id && d_id) {
                if (!radarr_hashes[m_id]) radarr_hashes[m_id] = new Set();
                radarr_hashes[m_id].add(String(d_id).toLowerCase());
            }
        }

        // Index Sonarr history hashes by SeriesId
        const sonarr_hashes: Record<number, Record<string, any[]>> = {};
        for (const record of sonarr_history) {
            const s_id = record.seriesId;
            const d_id = record.downloadId;
            const ep = record.episode;
            if (s_id && d_id) {
                const d_id_str = String(d_id).toLowerCase();
                if (!sonarr_hashes[s_id]) sonarr_hashes[s_id] = {};
                if (!sonarr_hashes[s_id][d_id_str]) sonarr_hashes[s_id][d_id_str] = [];
                if (ep) sonarr_hashes[s_id][d_id_str].push(ep);
            }
        }

        const combined_results: any[] = [];

        // --- PROCESS MOVIES (Radarr) ---
        for (const movie of radarr_movies) {
            const has_file = movie.hasFile || false;
            const monitored = movie.monitored || false;
            let lib_status = has_file ? "Downloaded" : monitored ? "Missing" : "Unmonitored";

            const entry: any = {
                id: movie.id,
                origin: "Radarr",
                title: movie.title,
                year: movie.year,
                path: movie.path,
                monitored: monitored,
                status: lib_status,
                file_loaded: has_file,
                torrent_state: "N/A",
                torrent_hashes: [],
                ratio: "N/A",
                seed_time: "N/A",
                watched: false,
                deletable: false,
                criteria: {},
                torrents: [],
            };

            let raw_ratio = 0.0;
            let raw_seed_time = 0;

            // Match Torrent
            let matched_torrent = null;
            const m_id = movie.id;
            if (radarr_hashes[m_id]) {
                for (const h of radarr_hashes[m_id]) {
                    if (torrents_by_hash[h]) {
                        matched_torrent = torrents_by_hash[h];
                        break;
                    }
                }
            }

            if (!matched_torrent && entry.path) {
                const movie_path = path.normalize(entry.path).toLowerCase();
                for (const torrent of qbit_torrents) {
                    if (torrent.content_path) {
                        const t_path = path.normalize(torrent.content_path).toLowerCase();
                        if (movie_path.includes(t_path) || t_path.includes(movie_path)) {
                            matched_torrent = torrent;
                            break;
                        }
                    }
                }
            }

            if (matched_torrent) {
                entry.torrent_state = matched_torrent.state;
                entry.torrent_hashes = [matched_torrent.hash];
                raw_ratio = matched_torrent.ratio || 0;
                raw_seed_time = matched_torrent.seeding_time || 0;
                entry.ratio = raw_ratio.toFixed(2);
                entry.seed_time = this._format_seed_time(raw_seed_time);

                entry.torrents = [
                    {
                        hash: matched_torrent.hash,
                        name: matched_torrent.name,
                        label: "Movie",
                        state: matched_torrent.state,
                        ratio: raw_ratio.toFixed(2),
                        seed_time: this._format_seed_time(raw_seed_time),
                    },
                ];
            }

            // Match Jellyfin
            const m_tmdb = String(movie.tmdbId || "");
            const m_imdb = String(movie.imdbId || "");
            let is_watched = false;

            for (const jf_item of Object.values(jf_data)) {
                if (jf_item.Type !== "Movie") continue;
                const p_ids = jf_item.ProviderIds || {};
                const jf_tmdb = String(p_ids.Tmdb || "");
                const jf_imdb = String(p_ids.Imdb || "");

                if ((m_tmdb && m_tmdb === jf_tmdb) || (m_imdb && m_imdb === jf_imdb)) {
                    if (jf_item.Watched) is_watched = true;
                    break;
                }
            }
            entry.watched = is_watched;

            // Deletability Logic
            const weeks_seconds = parseFloat(config.min_seed_weeks || 4) * 7 * 24 * 3600;
            const c_disk = is_disk_full_check;
            const c_watched = is_watched;
            const c_time = raw_seed_time >= weeks_seconds;
            const c_ratio = raw_ratio >= parseFloat(config.min_ratio || 1.0);

            entry.deletable = c_disk && c_watched && c_time && c_ratio;
            entry.criteria = { disk: c_disk, watched: c_watched, time: c_time, ratio: c_ratio };

            combined_results.push(entry);
        }

        // --- PROCESS SERIES (Sonarr) ---
        for (const show of sonarr_series) {
            const stats = show.statistics || {};
            const ep_count = stats.episodeCount || 0;
            const file_count = stats.episodeFileCount || 0;
            let lib_status = ep_count === 0 ? "No Episodes" : file_count === ep_count ? "Downloaded" : file_count === 0 ? "Missing" : `Partial (${file_count}/${ep_count})`;

            const s_tvdb = String(show.tvdbId || "");
            let is_watched = false;
            for (const jf_item of Object.values(jf_data)) {
                if (jf_item.Type === "Series") {
                    const p_ids = jf_item.ProviderIds || {};
                    if (s_tvdb && s_tvdb === String(p_ids.Tvdb || "")) {
                        if (jf_item.Watched) is_watched = true;
                        break;
                    }
                }
            }

            const entry: any = {
                id: show.id,
                origin: "Sonarr",
                title: show.title,
                year: show.year,
                path: show.path,
                monitored: show.monitored,
                status: lib_status,
                file_loaded: file_count > 0,
                torrent_state: "N/A",
                torrent_hashes: [],
                ratio: "N/A",
                seed_time: "N/A",
                watched: is_watched,
                deletable: false,
                criteria: {},
                torrents: [],
            };

            const matched_torrents_list: any[] = [];
            const hash_metadata_map: Record<string, string> = {};

            const s_id = show.id;
            if (sonarr_hashes[s_id]) {
                for (const [h, episodes] of Object.entries(sonarr_hashes[s_id])) {
                    if (torrents_by_hash[h]) {
                        const t = torrents_by_hash[h];
                        matched_torrents_list.push(t);

                        if (episodes && episodes.length > 0) {
                            const seasons = [...new Set(episodes.map((e: any) => e.seasonNumber).filter((s: any) => s !== undefined))].sort((a: any, b: any) => a - b);
                            if (seasons.length === 1) {
                                const s_num = seasons[0];
                                if (episodes.length === 1) {
                                    const e_num = episodes[0].episodeNumber;
                                    hash_metadata_map[h] = `S${String(s_num).padStart(2, "0")}E${String(e_num).padStart(2, "0")}`;
                                } else {
                                    hash_metadata_map[h] = `S${String(s_num).padStart(2, "0")}`;
                                }
                            } else if (seasons.length > 1) {
                                hash_metadata_map[h] = `S${String(seasons[0]).padStart(2, "0")}-S${String(seasons[seasons.length - 1]).padStart(2, "0")}`;
                            }
                        }
                    }
                }
            }

            if (matched_torrents_list.length === 0 && entry.path) {
                const show_path = path.normalize(entry.path).toLowerCase();
                for (const torrent of qbit_torrents) {
                    if (torrent.content_path) {
                        const t_path = path.normalize(torrent.content_path).toLowerCase();
                        if (t_path.includes(show_path)) {
                            matched_torrents_list.push(torrent);
                        }
                    }
                }
            }

            const weeks_seconds = parseFloat(config.min_seed_weeks || 4) * 7 * 24 * 3600;
            const c_disk = is_disk_full_check;
            const c_watched = is_watched;

            if (matched_torrents_list.length > 0) {
                const labels: (string | null)[] = [];
                for (const t of matched_torrents_list) {
                    const t_hash = t.hash.toLowerCase();
                    if (hash_metadata_map[t_hash]) {
                        labels.push(hash_metadata_map[t_hash]);
                        continue;
                    }
                    const match = t.name.match(/\bS(\d+)(?:E(\d+))?\b/i);
                    if (match) {
                        labels.push(match[2] ? `S${match[1]}E${match[2]}` : `S${match[1]}`);
                    } else {
                        labels.push(null);
                    }
                }

                const label_counts: Record<string, number> = {};
                labels.forEach((l) => {
                    if (l) label_counts[l] = (label_counts[l] || 0) + 1;
                });

                const torrents_data: any[] = [];
                const all_ratios: number[] = [];
                const all_seed_times: number[] = [];
                const all_states = new Set<string>();

                matched_torrents_list.forEach((t, i) => {
                    const lbl = labels[i];
                    let display_label = t.name;
                    if (lbl && label_counts[lbl] === 1) display_label = lbl;
                    else if (lbl) display_label = `${lbl} (${t.name})`;

                    const raw_ratio = t.ratio || 0;
                    const raw_seed_time = t.seeding_time || 0;
                    all_ratios.push(raw_ratio);
                    all_seed_times.push(raw_seed_time);
                    all_states.add(t.state);

                    torrents_data.push({
                        hash: t.hash,
                        name: t.name,
                        label: display_label,
                        state: t.state,
                        ratio_raw: raw_ratio,
                        ratio: raw_ratio.toFixed(2),
                        seed_time_raw: raw_seed_time,
                        seed_time: this._format_seed_time(raw_seed_time),
                    });
                });

                entry.torrents = torrents_data;
                entry.torrent_hashes = torrents_data.map((t) => t.hash);
                entry.torrent_state = Array.from(all_states).join(", ");

                const avg_ratio = all_ratios.length > 0 ? all_ratios.reduce((a, b) => a + b, 0) / all_ratios.length : 0;
                const max_time = all_seed_times.length > 0 ? Math.max(...all_seed_times) : 0;
                const min_time = all_seed_times.length > 0 ? Math.min(...all_seed_times) : 0;

                entry.ratio = `Avg: ${avg_ratio.toFixed(2)}`;
                entry.seed_time = `Max: ${this._format_seed_time(max_time)}`;

                const c_time = min_time >= weeks_seconds;
                const c_ratio = avg_ratio >= parseFloat(config.min_ratio || 1.0);

                entry.deletable = c_disk && c_watched && c_time && c_ratio;
                entry.criteria = { disk: c_disk, watched: c_watched, time: c_time, ratio: c_ratio };
            } else {
                entry.deletable = false;
                entry.criteria = { disk: c_disk, watched: c_watched, time: false, ratio: false };
            }

            combined_results.push(entry);
        }

        console.info(`Processed ${combined_results.length} media items.`);
        return combined_results;
    }

    async get_disk_usage() {
        const disks = await this.radarr.get_disk_space();
        if (!disks || disks.length === 0) return null;

        let target_disk = null;
        const root_folders = await this.radarr.get_root_folders();

        if (root_folders && root_folders.length > 0) {
            const rf_path = root_folders[0].path || "";
            let best_match = null;
            let max_len = -1;

            for (const d of disks) {
                const d_path = d.path || "";
                if (rf_path.startsWith(d_path)) {
                    if (d_path.length > max_len) {
                        max_len = d_path.length;
                        best_match = d;
                    }
                }
            }
            if (best_match) target_disk = best_match;
        }

        if (!target_disk) {
            target_disk = disks.find((d: any) => d.path === "/media");
        }

        if (!target_disk && disks.length > 0) {
            target_disk = disks[0];
        }

        if (target_disk) {
            const free = target_disk.freeSpace || 0;
            const total = target_disk.totalSpace || 0;
            const used = total - free;
            const percent = total > 0 ? (used / total) * 100 : 0;

            return {
                path: target_disk.path,
                free: this._format_bytes(free),
                total: this._format_bytes(total),
                percent: parseFloat(percent.toFixed(2)),
            };
        }
        return null;
    }

    async get_service_statuses() {
        const [radarr, sonarr, qbit, jellyfin] = await Promise.all([this.radarr.check_connection(), this.sonarr.check_connection(), this.qbit.check_connection(), this.jellyfin.check_connection()]);

        return {
            Radarr: radarr,
            Sonarr: sonarr,
            qBittorrent: qbit,
            Jellyfin: jellyfin,
        };
    }
}

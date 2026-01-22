import logging
import os

from services.jellyfin import JellyfinClient
from services.qbittorrent import QBitClient
from services.radarr import RadarrClient
from services.sonarr import SonarrClient

logger = logging.getLogger(__name__)


class MatcherService:
    def __init__(self):
        self.radarr = RadarrClient()
        self.sonarr = SonarrClient()
        self.qbit = QBitClient()
        self.jellyfin = JellyfinClient()

    def _format_bytes(self, size):
        power = 1024
        n = 0
        power_labels = {0: "", 1: "K", 2: "M", 3: "G", 4: "T", 5: "P"}
        while size > power:
            size /= power
            n += 1
        return f"{size:.2f} {power_labels.get(n, '')}B"

    def _format_seed_time(self, seconds):
        if not seconds:
            return "0s"
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        if days > 0:
            return f"{days}d {hours}h"
        elif hours > 0:
            minutes = (seconds % 3600) // 60
            return f"{hours}h {minutes}m"
        else:
            minutes = (seconds % 3600) // 60
            return f"{minutes}m"

    def get_aggregated_media(self):
        """
        Orchestrates fetching data and matching it.
        """
        logger.info("Starting media sync...")

        # 1. Fetch data
        radarr_movies = self.radarr.get_movies()
        radarr_history = self.radarr.get_history(page_size=10000)
        logger.info(f"Fetched {len(radarr_history)} history records from Radarr.")
        sonarr_series = self.sonarr.get_series()
        sonarr_history = self.sonarr.get_history(page_size=10000)
        logger.info(f"Fetched {len(sonarr_history)} history records from Sonarr.")

        qbit_torrents = self.qbit.get_torrents()

        # Index torrents by hash
        torrents_by_hash = {t.get("hash", "").lower(): t for t in qbit_torrents}
        logger.info(f"Fetched {len(qbit_torrents)} torrents from qBittorrent.")

        # Index Radarr history hashes by MovieId
        radarr_hashes = {}
        for record in radarr_history:
            m_id = record.get("movieId")
            d_id = record.get("downloadId")
            if m_id and d_id:
                if m_id not in radarr_hashes:
                    radarr_hashes[m_id] = set()
                radarr_hashes[m_id].add(str(d_id).lower())

        logger.info(f"Indexed {len(radarr_hashes)} movies with history in Radarr.")

        # Index Sonarr history hashes by SeriesId
        sonarr_hashes = {}
        for record in sonarr_history:
            s_id = record.get("seriesId")
            d_id = record.get("downloadId")
            if s_id and d_id:
                if s_id not in sonarr_hashes:
                    sonarr_hashes[s_id] = set()
                sonarr_hashes[s_id].add(str(d_id).lower())

        logger.info(f"Indexed {len(sonarr_hashes)} series with history in Sonarr.")

        # This returns a dict of ItemId -> ItemData with 'Watched' status
        jf_data = self.jellyfin.get_all_items_with_play_status()

        combined_results = []

        # --- PROCESS MOVIES (Radarr) ---
        for movie in radarr_movies:
            # Basic info
            has_file = movie.get("hasFile", False)
            monitored = movie.get("monitored", False)

            if has_file:
                lib_status = "Downloaded"
            elif monitored:
                lib_status = "Missing"
            else:
                lib_status = "Unmonitored"

            entry = {
                "id": movie.get("id"),
                "origin": "Radarr",
                "title": movie.get("title"),
                "year": movie.get("year"),
                "path": movie.get("path"),
                "monitored": monitored,
                "status": lib_status,
                "file_loaded": has_file,
                "torrent_state": "N/A",
                "torrent_hashes": [],
                "ratio": "N/A",
                "seed_time": "N/A",
                "watched": False,
            }

            # Match Torrent
            # 1. Try Hash Match via History
            matched_torrent = None
            m_id = movie.get("id")
            if m_id in radarr_hashes:
                for h in radarr_hashes[m_id]:
                    if h in torrents_by_hash:
                        matched_torrent = torrents_by_hash[h]
                        logger.info(f"Matched movie '{movie.get('title')}' by hash {h}")
                        break

            # 2. Fallback to Path Match
            if not matched_torrent and entry["path"]:
                movie_path = os.path.normpath(entry["path"]).lower()
                for torrent in qbit_torrents:
                    if "content_path" in torrent:
                        t_path = os.path.normpath(torrent["content_path"]).lower()
                        # Check for containment
                        if movie_path in t_path or t_path in movie_path:
                            matched_torrent = torrent
                            logger.info(
                                f"Matched movie '{movie.get('title')}' by path: {t_path}"
                            )
                            break

            if matched_torrent:
                entry["torrent_state"] = matched_torrent.get("state")
                entry["torrent_hashes"] = [matched_torrent.get("hash")]
                entry["ratio"] = f"{matched_torrent.get('ratio', 0):.2f}"
                entry["seed_time"] = self._format_seed_time(
                    matched_torrent.get("seeding_time", 0)
                )

            # Match Jellyfin
            m_tmdb = str(movie.get("tmdbId", ""))
            m_imdb = str(movie.get("imdbId", ""))

            is_watched = False
            for jf_item in jf_data.values():
                if jf_item.get("Type") != "Movie":
                    continue

                p_ids = jf_item.get("ProviderIds", {})
                jf_tmdb = str(p_ids.get("Tmdb", ""))
                jf_imdb = str(p_ids.get("Imdb", ""))

                if (m_tmdb and m_tmdb == jf_tmdb) or (m_imdb and m_imdb == jf_imdb):
                    if jf_item.get("Watched"):
                        is_watched = True
                    break

            entry["watched"] = is_watched
            combined_results.append(entry)

        # --- PROCESS SERIES (Sonarr) ---
        for show in sonarr_series:
            stats = show.get("statistics", {})
            ep_count = stats.get("episodeCount", 0)
            file_count = stats.get("episodeFileCount", 0)

            if ep_count == 0:
                lib_status = "No Episodes"
            elif file_count == ep_count:
                lib_status = "Downloaded"
            elif file_count == 0:
                lib_status = "Missing"
            else:
                lib_status = f"Partial ({file_count}/{ep_count})"

            entry = {
                "id": show.get("id"),
                "origin": "Sonarr",
                "title": show.get("title"),
                "year": show.get("year"),
                "path": show.get("path"),
                "monitored": show.get("monitored"),
                "status": lib_status,
                "file_loaded": file_count > 0,
                "torrent_state": "N/A",
                "torrent_hashes": [],
                "ratio": "N/A",
                "seed_time": "N/A",
                "watched": False,
            }

            # Match Torrent
            matches = set()
            found_hashes = set()
            ratios = []
            seed_times = []

            # 1. Try Hash Match via History
            s_id = show.get("id")
            if s_id in sonarr_hashes:
                for h in sonarr_hashes[s_id]:
                    if h in torrents_by_hash:
                        t = torrents_by_hash[h]
                        state = t.get("state")
                        matches.add(state)
                        found_hashes.add(h)
                        ratios.append(t.get("ratio", 0))
                        seed_times.append(t.get("seeding_time", 0))
                        logger.info(
                            f"Matched series '{show.get('title')}' by hash {h} (state: {state})"
                        )

            # 2. Fallback to Path Match
            if not matches and entry["path"]:
                show_path = os.path.normpath(entry["path"]).lower()
                for torrent in qbit_torrents:
                    if "content_path" in torrent:
                        t_path = os.path.normpath(torrent["content_path"]).lower()
                        if show_path in t_path:
                            matches.add(torrent.get("state"))
                            found_hashes.add(torrent.get("hash"))
                            ratios.append(torrent.get("ratio", 0))
                            seed_times.append(torrent.get("seeding_time", 0))
                            logger.info(
                                f"Matched series '{show.get('title')}' by path: {t_path}"
                            )

            if matches:
                entry["torrent_state"] = ", ".join(list(matches))
                entry["torrent_hashes"] = list(found_hashes)

                if ratios:
                    avg_ratio = sum(ratios) / len(ratios)
                    entry["ratio"] = f"Avg: {avg_ratio:.2f}"

                if seed_times:
                    max_time = max(seed_times)
                    entry["seed_time"] = f"Max: {self._format_seed_time(max_time)}"

            # Match Jellyfin
            s_tvdb = str(show.get("tvdbId", ""))

            # Since we focused on Movies and Episodes in JF client,
            # we try to match Series if available, or rely on aggregation later.
            # Currently this might not find matches if "Series" type isn't fetched.
            is_watched = False
            for jf_item in jf_data.values():
                if jf_item.get("Type") == "Series":
                    p_ids = jf_item.get("ProviderIds", {})
                    jf_tvdb = str(p_ids.get("Tvdb", ""))
                    if s_tvdb and s_tvdb == jf_tvdb:
                        if jf_item.get("Watched"):
                            is_watched = True
                        break

            entry["watched"] = is_watched
            combined_results.append(entry)

        logger.info(f"Processed {len(combined_results)} media items.")
        return combined_results

    def get_disk_usage(self):
        disks = self.radarr.get_disk_space()
        if not disks:
            return None

        target_disk = None

        # 1. Try to match against Radarr Root Folder
        root_folders = self.radarr.get_root_folders()
        if root_folders:
            rf_path = root_folders[0].get("path", "")

            # Find the disk mount that contains this root folder
            best_match = None
            max_len = -1

            for d in disks:
                d_path = d.get("path", "")
                if rf_path.startswith(d_path):
                    if len(d_path) > max_len:
                        max_len = len(d_path)
                        best_match = d

            if best_match:
                target_disk = best_match

        # 2. Fallback to hardcoded /media
        if not target_disk:
            for d in disks:
                if d.get("path") == "/media":
                    target_disk = d
                    break

        # 3. Fallback to first disk
        if not target_disk and disks:
            target_disk = disks[0]

        if target_disk:
            free = target_disk.get("freeSpace", 0)
            total = target_disk.get("totalSpace", 0)
            used = total - free
            percent = (used / total * 100) if total > 0 else 0

            return {
                "path": target_disk.get("path"),
                "free": self._format_bytes(free),
                "total": self._format_bytes(total),
                "percent": round(percent, 2),
            }
        return None

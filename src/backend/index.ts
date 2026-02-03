import express from "express";
import cors from "cors";
import path from "path";
import { ConfigManager } from "./services/config_manager";
import { MatcherService } from "./services/matcher";
import { QBitClient } from "./services/qbittorrent";
import { RadarrClient } from "./services/radarr";
import { SonarrClient } from "./services/sonarr";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const cm = new ConfigManager();
let matcher = new MatcherService();

// API Routes
app.get("/api/config", (req, res) => {
    res.json(cm.get_all());
});

app.post("/api/config", (req, res) => {
    const newConfig = {
        RADARR_HOST: req.body.RADARR_HOST,
        RADARR_API_KEY: req.body.RADARR_API_KEY,
        SONARR_HOST: req.body.SONARR_HOST,
        SONARR_API_KEY: req.body.SONARR_API_KEY,
        QBIT_HOST: req.body.QBIT_HOST,
        QBIT_USERNAME: req.body.QBIT_USERNAME,
        QBIT_PASSWORD: req.body.QBIT_PASSWORD,
        JELLYFIN_HOST: req.body.JELLYFIN_HOST,
        JELLYFIN_API_KEY: req.body.JELLYFIN_API_KEY,
        DISK_THRESHOLD: parseInt(req.body.DISK_THRESHOLD) || 90,
        MIN_SEED_WEEKS: parseInt(req.body.MIN_SEED_WEEKS) || 4,
        MIN_RATIO: parseFloat(req.body.MIN_RATIO) || 1.0,
    };
    cm.update(newConfig);
    matcher = new MatcherService();
    res.json({ success: true, config: cm.get_all() });
});

app.get("/api/status", async (req, res) => {
    const statuses = await matcher.get_service_statuses();
    res.json(statuses);
});

app.get("/api/disk", async (req, res) => {
    const diskUsage = await matcher.get_disk_usage();
    res.json(diskUsage);
});

app.get("/api/scan", async (req, res) => {
    const config = cm.get_all();
    const scanConfig = {
        disk_threshold: config.DISK_THRESHOLD,
        min_seed_weeks: config.MIN_SEED_WEEKS,
        min_ratio: config.MIN_RATIO,
    };

    try {
        const [disk_usage, services, media_items_raw] = await Promise.all([matcher.get_disk_usage(), matcher.get_service_statuses(), matcher.get_aggregated_media(scanConfig)]);

        const media_items = media_items_raw.filter((item: any) => item.file_loaded);
        const total_items = media_items.length;
        const eligible_items = media_items.filter((item: any) => item.deletable).length;

        res.json({
            config: scanConfig,
            disk_usage,
            services,
            stats: { total: total_items, eligible: eligible_items },
            media: media_items,
        });
    } catch (error) {
        console.error("Error during scan:", error);
        res.status(500).json({ error: "Failed to perform scan" });
    }
});

app.post("/api/delete", async (req, res) => {
    const { origin, id, torrent_hashes, delete_type } = req.body;
    const hashes = (torrent_hashes || "")
        .split(",")
        .map((h: string) => h.trim())
        .filter((h: string) => h);

    console.info(`Received delete request for ${origin} ID ${id} (type=${delete_type}) with hashes: ${hashes}`);

    try {
        // Delete Torrents
        if (hashes.length > 0) {
            const qbit = new QBitClient();
            for (const h of hashes) {
                await qbit.delete_torrent(h);
            }
        }

        // Delete Media from Radarr/Sonarr
        if (delete_type === "media") {
            if (origin === "Radarr") {
                const radarr = new RadarrClient();
                await radarr.delete_movie(id);
            } else if (origin === "Sonarr") {
                const sonarr = new SonarrClient();
                await sonarr.delete_series(id);
            }
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Error during deletion:", error);
        res.status(500).json({ error: "Failed to delete item" });
    }
});

// Serve static files from the React app in production
if (process.env.NODE_ENV === "production") {
    app.use(express.static(path.join(__dirname, "../frontend/dist")));
    app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "../frontend/dist/index.html"));
    });
}

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

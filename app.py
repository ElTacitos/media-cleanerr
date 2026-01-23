import logging

from flask import (
    Flask,
    jsonify,
    redirect,
    render_template,
    render_template_string,
    request,
    url_for,
)
from services.config_manager import ConfigManager
from services.matcher import MatcherService
from services.qbittorrent import QBitClient
from services.radarr import RadarrClient
from services.sonarr import SonarrClient

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)


@app.route("/")
def index():
    cm = ConfigManager()

    if "disk_threshold" in request.args:
        cm.update(
            {
                "DISK_THRESHOLD": request.args.get("disk_threshold", 90, type=int),
                "MIN_SEED_WEEKS": request.args.get("min_seed_weeks", 4, type=int),
                "MIN_RATIO": request.args.get("min_ratio", 1.0, type=float),
            }
        )

    config = {
        "disk_threshold": cm.get("DISK_THRESHOLD", 90),
        "min_seed_weeks": cm.get("MIN_SEED_WEEKS", 4),
        "min_ratio": cm.get("MIN_RATIO", 1.0),
    }
    return render_template("index.html", config=config)


@app.route("/api/status_html")
def status_html():
    matcher = MatcherService()
    service_statuses = matcher.get_service_statuses()
    return render_template("partials/status.html", service_statuses=service_statuses)


@app.route("/api/disk_html")
def disk_html():
    matcher = MatcherService()
    disk_usage = matcher.get_disk_usage()
    return render_template("partials/disk.html", disk_usage=disk_usage)


@app.route("/api/media_html")
def media_html():
    cm = ConfigManager()
    config = {
        "disk_threshold": cm.get("DISK_THRESHOLD", 90),
        "min_seed_weeks": cm.get("MIN_SEED_WEEKS", 4),
        "min_ratio": cm.get("MIN_RATIO", 1.0),
    }
    matcher = MatcherService()
    media_items_raw = matcher.get_aggregated_media(config=config)
    media_items = [item for item in media_items_raw if item.get("file_loaded")]
    return render_template(
        "partials/media_rows.html", media_items=media_items, config=config
    )


@app.route("/api/scan")
def api_scan():
    cm = ConfigManager()
    config = {
        "disk_threshold": cm.get("DISK_THRESHOLD", 90),
        "min_seed_weeks": cm.get("MIN_SEED_WEEKS", 4),
        "min_ratio": cm.get("MIN_RATIO", 1.0),
    }

    matcher = MatcherService()
    disk_usage = matcher.get_disk_usage()
    service_statuses = matcher.get_service_statuses()
    media_items_raw = matcher.get_aggregated_media(config=config)
    media_items = [item for item in media_items_raw if item.get("file_loaded")]

    # Calculate stats
    total_items = len(media_items)
    eligible_items = sum(1 for item in media_items if item.get("deletable"))

    return jsonify(
        {
            "config": config,
            "disk_usage": disk_usage,
            "services": service_statuses,
            "stats": {"total": total_items, "eligible": eligible_items},
            "media": media_items,
        }
    )


@app.route("/delete", methods=["POST"])
def delete_media():
    origin = request.form.get("origin")
    media_id = request.form.get("id")
    torrent_hashes_str = request.form.get("torrent_hashes", "")
    delete_type = request.form.get("delete_type", "media")

    logger.info(
        f"Received delete request for {origin} ID {media_id} (type={delete_type}) with hashes: {torrent_hashes_str}"
    )

    # Delete Torrents
    if torrent_hashes_str:
        qbit = QBitClient()
        hashes = torrent_hashes_str.split(",")
        for h in hashes:
            h = h.strip()
            if h:
                qbit.delete_torrent(h)

    # Delete Media from Radarr/Sonarr only if requested
    if delete_type == "media":
        if origin == "Radarr":
            client = RadarrClient()
            client.delete_movie(media_id)
        elif origin == "Sonarr":
            client = SonarrClient()
            client.delete_series(media_id)

    return redirect(url_for("index"))


SETTINGS_TEMPLATE = """
<!doctype html>
<html>
<head>
    <title>Settings</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
</head>
<body class="bg-light">
    <div class="container py-5" style="max-width: 800px;">
        <div class="card shadow-sm">
            <div class="card-header bg-white">
                <h1 class="h3 mb-0">App Settings</h1>
            </div>
            <div class="card-body">
                <form method="post">
                    <h4 class="mb-3 text-primary">Radarr</h4>
                    <div class="mb-3">
                        <label class="form-label">Host URL</label>
                        <input class="form-control" name="RADARR_HOST" value="{{ c.RADARR_HOST or '' }}" placeholder="http://radarr:7878">
                    </div>
                    <div class="mb-4">
                        <label class="form-label">API Key</label>
                        <input type="password" class="form-control" name="RADARR_API_KEY" value="{{ c.RADARR_API_KEY or '' }}">
                    </div>

                    <hr class="my-4">

                    <h4 class="mb-3 text-info">Sonarr</h4>
                    <div class="mb-3">
                        <label class="form-label">Host URL</label>
                        <input class="form-control" name="SONARR_HOST" value="{{ c.SONARR_HOST or '' }}" placeholder="http://sonarr:8989">
                    </div>
                    <div class="mb-4">
                        <label class="form-label">API Key</label>
                        <input type="password" class="form-control" name="SONARR_API_KEY" value="{{ c.SONARR_API_KEY or '' }}">
                    </div>

                    <hr class="my-4">

                    <h4 class="mb-3 text-success">qBittorrent</h4>
                    <div class="mb-3">
                        <label class="form-label">Host URL</label>
                        <input class="form-control" name="QBIT_HOST" value="{{ c.QBIT_HOST or '' }}" placeholder="http://qbittorrent:8080">
                    </div>
                    <div class="row">
                        <div class="col-md-6 mb-3">
                            <label class="form-label">Username</label>
                            <input class="form-control" name="QBIT_USERNAME" value="{{ c.QBIT_USERNAME or '' }}">
                        </div>
                        <div class="col-md-6 mb-4">
                            <label class="form-label">Password</label>
                            <input type="password" class="form-control" name="QBIT_PASSWORD" value="{{ c.QBIT_PASSWORD or '' }}">
                        </div>
                    </div>

                    <hr class="my-4">

                    <h4 class="mb-3 text-warning">Jellyfin</h4>
                    <div class="mb-3">
                        <label class="form-label">Host URL</label>
                        <input class="form-control" name="JELLYFIN_HOST" value="{{ c.JELLYFIN_HOST or '' }}" placeholder="http://jellyfin:8096">
                    </div>
                    <div class="mb-4">
                        <label class="form-label">API Key</label>
                        <input type="password" class="form-control" name="JELLYFIN_API_KEY" value="{{ c.JELLYFIN_API_KEY or '' }}">
                    </div>

                    <hr class="my-4">

                    <h4 class="mb-3 text-secondary">Deletability Rules</h4>
                    <div class="row">
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Disk Threshold (%)</label>
                            <input type="number" class="form-control" name="DISK_THRESHOLD" value="{{ c.DISK_THRESHOLD or 90 }}">
                        </div>
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Min Seed Weeks</label>
                            <input type="number" class="form-control" name="MIN_SEED_WEEKS" value="{{ c.MIN_SEED_WEEKS or 4 }}">
                        </div>
                        <div class="col-md-4 mb-3">
                            <label class="form-label">Min Ratio</label>
                            <input type="number" step="0.1" class="form-control" name="MIN_RATIO" value="{{ c.MIN_RATIO or 1.0 }}">
                        </div>
                    </div>

                    <hr class="my-4">

                    <div class="d-flex justify-content-between">
                        <a href="/" class="btn btn-outline-secondary">Cancel</a>
                        <button type="submit" class="btn btn-primary px-4">Save Settings</button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</body>
</html>
"""


@app.route("/settings", methods=["GET", "POST"])
def settings():
    cm = ConfigManager()
    if request.method == "POST":
        new_config = {
            "RADARR_HOST": request.form.get("RADARR_HOST"),
            "RADARR_API_KEY": request.form.get("RADARR_API_KEY"),
            "SONARR_HOST": request.form.get("SONARR_HOST"),
            "SONARR_API_KEY": request.form.get("SONARR_API_KEY"),
            "QBIT_HOST": request.form.get("QBIT_HOST"),
            "QBIT_USERNAME": request.form.get("QBIT_USERNAME"),
            "QBIT_PASSWORD": request.form.get("QBIT_PASSWORD"),
            "JELLYFIN_HOST": request.form.get("JELLYFIN_HOST"),
            "JELLYFIN_API_KEY": request.form.get("JELLYFIN_API_KEY"),
            "DISK_THRESHOLD": int(request.form.get("DISK_THRESHOLD") or 90),
            "MIN_SEED_WEEKS": int(request.form.get("MIN_SEED_WEEKS") or 4),
            "MIN_RATIO": float(request.form.get("MIN_RATIO") or 1.0),
        }
        cm.update(new_config)
        return redirect(url_for("index"))

    return render_template_string(SETTINGS_TEMPLATE, c=cm.get_all())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

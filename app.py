import logging

from flask import (
    Flask,
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
    media_items = matcher.get_aggregated_media(config=config)
    return render_template(
        "partials/media_rows.html", media_items=media_items, config=config
    )


@app.route("/delete", methods=["POST"])
def delete_media():
    origin = request.form.get("origin")
    media_id = request.form.get("id")
    torrent_hashes_str = request.form.get("torrent_hashes", "")

    logger.info(
        f"Received delete request for {origin} ID {media_id} with hashes: {torrent_hashes_str}"
    )

    # Delete Torrents
    if torrent_hashes_str:
        qbit = QBitClient()
        hashes = torrent_hashes_str.split(",")
        for h in hashes:
            h = h.strip()
            if h:
                qbit.delete_torrent(h)

    # Delete Media from Radarr/Sonarr
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
    <style>
        body { font-family: sans-serif; margin: 0 auto; max-width: 600px; padding: 20px; }
        label { font-weight: bold; display: block; margin-top: 15px; }
        input { width: 100%; padding: 8px; margin-top: 5px; box-sizing: border-box; }
        hr { margin: 20px 0; border: 0; border-top: 1px solid #ccc; }
        button { background: #007bff; color: white; border: none; padding: 10px 20px; cursor: pointer; margin-top: 20px; }
        a { display: inline-block; margin-top: 20px; margin-left: 10px; color: #6c757d; }
    </style>
</head>
<body>
    <h1>App Settings</h1>
    <form method="post">
        <h2>Radarr</h2>
        <label>Host URL</label>
        <input name="RADARR_HOST" value="{{ c.RADARR_HOST or '' }}" placeholder="http://radarr:7878">
        <label>API Key</label>
        <input type="password" name="RADARR_API_KEY" value="{{ c.RADARR_API_KEY or '' }}">

        <hr>
        <h2>Sonarr</h2>
        <label>Host URL</label>
        <input name="SONARR_HOST" value="{{ c.SONARR_HOST or '' }}" placeholder="http://sonarr:8989">
        <label>API Key</label>
        <input type="password" name="SONARR_API_KEY" value="{{ c.SONARR_API_KEY or '' }}">

        <hr>
        <h2>qBittorrent</h2>
        <label>Host URL</label>
        <input name="QBIT_HOST" value="{{ c.QBIT_HOST or '' }}" placeholder="http://qbittorrent:8080">
        <label>Username</label>
        <input name="QBIT_USERNAME" value="{{ c.QBIT_USERNAME or '' }}">
        <label>Password</label>
        <input type="password" name="QBIT_PASSWORD" value="{{ c.QBIT_PASSWORD or '' }}">

        <hr>
        <h2>Jellyfin</h2>
        <label>Host URL</label>
        <input name="JELLYFIN_HOST" value="{{ c.JELLYFIN_HOST or '' }}" placeholder="http://jellyfin:8096">
        <label>API Key</label>
        <input type="password" name="JELLYFIN_API_KEY" value="{{ c.JELLYFIN_API_KEY or '' }}">

        <hr>
        <button type="submit">Save Settings</button>
        <a href="/">Cancel</a>
    </form>
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
        }
        cm.update(new_config)
        return redirect(url_for("index"))

    return render_template_string(SETTINGS_TEMPLATE, c=cm.get_all())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

import logging

from flask import Flask, redirect, render_template, request, url_for
from services.matcher import MatcherService
from services.qbittorrent import QBitClient
from services.radarr import RadarrClient
from services.sonarr import SonarrClient

# Configure logging
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)


@app.route("/")
def index():
    matcher = MatcherService()
    disk_usage = matcher.get_disk_usage()
    media_items = matcher.get_aggregated_media()
    return render_template("index.html", media_items=media_items, disk_usage=disk_usage)


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


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

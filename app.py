import logging

from flask import Flask, render_template
from services.matcher import MatcherService

# Configure logging
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)


@app.route("/")
def index():
    matcher = MatcherService()
    media_items = matcher.get_aggregated_media()
    return render_template("index.html", media_items=media_items)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)

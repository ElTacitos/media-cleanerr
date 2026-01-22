import os

from dotenv import load_dotenv

load_dotenv()

# qBittorrent
QBIT_HOST = os.getenv("QBIT_HOST")
QBIT_USERNAME = os.getenv("QBIT_USERNAME")
QBIT_PASSWORD = os.getenv("QBIT_PASSWORD")

# Radarr
RADARR_HOST = os.getenv("RADARR_HOST")
RADARR_API_KEY = os.getenv("RADARR_API_KEY")

# Sonarr
SONARR_HOST = os.getenv("SONARR_HOST")
SONARR_API_KEY = os.getenv("SONARR_API_KEY")

# Jellyfin
JELLYFIN_HOST = os.getenv("JELLYFIN_HOST")
JELLYFIN_API_KEY = os.getenv("JELLYFIN_API_KEY")

import logging

import requests

from services.config_manager import ConfigManager

logger = logging.getLogger(__name__)


class RadarrClient:
    def __init__(self):
        config = ConfigManager()
        self.host = config.get("RADARR_HOST")
        self.api_key = config.get("RADARR_API_KEY")

    def get_movies(self):
        if not self.host or not self.api_key:
            logger.warning("Radarr credentials not configured")
            return []

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v3/movie"
            headers = {"X-Api-Key": self.api_key}

            response = requests.get(url, headers=headers, timeout=(5, 60))
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching data from Radarr: {e}")
            return []

    def get_history(self, page_size=1000):
        if not self.host or not self.api_key:
            return []

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v3/history"
            headers = {"X-Api-Key": self.api_key}
            params = {"pageSize": page_size}

            response = requests.get(
                url, headers=headers, params=params, timeout=(5, 60)
            )
            response.raise_for_status()
            return response.json().get("records", [])
        except Exception as e:
            logger.error(f"Error fetching history from Radarr: {e}")
            return []

    def delete_movie(self, movie_id):
        if not self.host or not self.api_key:
            return False

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v3/movie/{movie_id}"
            headers = {"X-Api-Key": self.api_key}
            params = {"deleteFiles": "true"}

            response = requests.delete(
                url, headers=headers, params=params, timeout=(5, 60)
            )
            response.raise_for_status()
            logger.info(f"Deleted movie {movie_id} from Radarr.")
            return True
        except Exception as e:
            logger.error(f"Error deleting movie {movie_id} from Radarr: {e}")
            return False

    def get_disk_space(self):
        if not self.host or not self.api_key:
            return []

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v3/diskspace"
            headers = {"X-Api-Key": self.api_key}

            response = requests.get(url, headers=headers, timeout=(5, 30))
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching disk space from Radarr: {e}")
            return []

    def get_root_folders(self):
        if not self.host or not self.api_key:
            return []

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v3/rootfolder"
            headers = {"X-Api-Key": self.api_key}

            response = requests.get(url, headers=headers, timeout=(5, 30))
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching root folders from Radarr: {e}")
            return []

    def check_connection(self):
        if not self.host or not self.api_key:
            return False
        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v3/system/status"
            headers = {"X-Api-Key": self.api_key}
            requests.get(url, headers=headers, timeout=5).raise_for_status()
            return True
        except Exception:
            return False

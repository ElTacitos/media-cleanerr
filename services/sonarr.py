import logging

import requests

from services.config_manager import ConfigManager

logger = logging.getLogger(__name__)


class SonarrClient:
    def __init__(self):
        config = ConfigManager()
        self.host = config.get("SONARR_HOST")
        self.api_key = config.get("SONARR_API_KEY")

    def get_series(self):
        if not self.host or not self.api_key:
            logger.warning("Sonarr credentials not configured")
            return []

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v3/series"
            headers = {"X-Api-Key": self.api_key}

            response = requests.get(url, headers=headers, timeout=(5, 60))
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching series from Sonarr: {e}")
            return []

    def get_episodes(self, series_id):
        if not self.host or not self.api_key:
            return []

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v3/episode?seriesId={series_id}"
            headers = {"X-Api-Key": self.api_key}

            response = requests.get(url, headers=headers, timeout=(5, 60))
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(
                f"Error fetching episodes for series {series_id} from Sonarr: {e}"
            )
            return []

    def get_history(self, page_size=1000):
        if not self.host or not self.api_key:
            return []

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v3/history"
            headers = {"X-Api-Key": self.api_key}
            params = {"pageSize": page_size, "includeEpisode": "true"}

            response = requests.get(
                url, headers=headers, params=params, timeout=(5, 60)
            )
            response.raise_for_status()
            return response.json().get("records", [])
        except Exception as e:
            logger.error(f"Error fetching history from Sonarr: {e}")
            return []

    def delete_series(self, series_id):
        if not self.host or not self.api_key:
            return False

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v3/series/{series_id}"
            headers = {"X-Api-Key": self.api_key}
            params = {"deleteFiles": "true"}

            response = requests.delete(
                url, headers=headers, params=params, timeout=(5, 60)
            )
            response.raise_for_status()
            logger.info(f"Deleted series {series_id} from Sonarr.")
            return True
        except Exception as e:
            logger.error(f"Error deleting series {series_id} from Sonarr: {e}")
            return False

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

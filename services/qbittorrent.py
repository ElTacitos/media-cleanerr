import logging

import config
import requests

logger = logging.getLogger(__name__)


class QBitClient:
    def __init__(self):
        self.host = config.QBIT_HOST
        self.username = config.QBIT_USERNAME
        self.password = config.QBIT_PASSWORD
        self.session = requests.Session()
        self.authenticated = False

    def login(self):
        if not self.host:
            logger.warning("qBittorrent host not configured")
            return False

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v2/auth/login"
            data = {"username": self.username, "password": self.password}

            response = self.session.post(url, data=data, timeout=(5, 30))
            response.raise_for_status()

            if response.text == "Fails.":
                logger.error("qBittorrent login failed.")
                self.authenticated = False
                return False

            self.authenticated = True
            return True
        except Exception as e:
            logger.error(f"Error logging into qBittorrent: {e}")
            self.authenticated = False
            return False

    def get_torrents(self):
        if not self.host:
            return []

        # Try to login if not authenticated
        if not self.authenticated:
            if not self.login():
                return []

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v2/torrents/info"

            response = self.session.get(url, timeout=(5, 60))

            # If 403, maybe session expired? Try relogin once.
            if response.status_code == 403:
                logger.info("Session expired, retrying login...")
                if self.login():
                    response = self.session.get(url, timeout=(5, 60))
                else:
                    return []

            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Error fetching torrents from qBittorrent: {e}")
            return []

    def delete_torrent(self, torrent_hash):
        if not self.host or not torrent_hash:
            return False

        if not self.authenticated:
            if not self.login():
                return False

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/api/v2/torrents/delete"
            # deleteFiles=true to remove content
            data = {"hashes": torrent_hash, "deleteFiles": "true"}

            response = self.session.post(url, data=data, timeout=(5, 60))
            response.raise_for_status()
            logger.info(f"Deleted torrent {torrent_hash} from qBittorrent.")
            return True
        except Exception as e:
            logger.error(f"Error deleting torrent {torrent_hash}: {e}")
            return False

    def check_connection(self):
        return self.login()

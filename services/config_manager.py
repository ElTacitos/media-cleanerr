import json
import logging
import os

logger = logging.getLogger(__name__)

CONFIG_FILE = "config/settings.json"


class ConfigManager:
    _instance = None
    _config = {}

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(ConfigManager, cls).__new__(cls)
            cls._instance.load_config()
        return cls._instance

    def load_config(self):
        # Load from file if exists
        if os.path.exists(CONFIG_FILE):
            try:
                with open(CONFIG_FILE, "r") as f:
                    self._config = json.load(f)
            except Exception as e:
                logger.error(f"Failed to load config file: {e}")

        # Initialize defaults from Environment Variables if not present in config
        defaults = {
            "QBIT_HOST": os.getenv("QBIT_HOST", ""),
            "QBIT_USERNAME": os.getenv("QBIT_USERNAME", ""),
            "QBIT_PASSWORD": os.getenv("QBIT_PASSWORD", ""),
            "RADARR_HOST": os.getenv("RADARR_HOST", ""),
            "RADARR_API_KEY": os.getenv("RADARR_API_KEY", ""),
            "SONARR_HOST": os.getenv("SONARR_HOST", ""),
            "SONARR_API_KEY": os.getenv("SONARR_API_KEY", ""),
            "JELLYFIN_HOST": os.getenv("JELLYFIN_HOST", ""),
            "JELLYFIN_API_KEY": os.getenv("JELLYFIN_API_KEY", ""),
        }

        for key, value in defaults.items():
            if key not in self._config:
                self._config[key] = value

    def get(self, key, default=None):
        return self._config.get(key, default)

    def set(self, key, value):
        self._config[key] = value
        self.save_config()

    def update(self, new_config):
        self._config.update(new_config)
        self.save_config()

    def save_config(self):
        try:
            os.makedirs(os.path.dirname(CONFIG_FILE), exist_ok=True)
            with open(CONFIG_FILE, "w") as f:
                json.dump(self._config, f, indent=4)
        except Exception as e:
            logger.error(f"Failed to save config file: {e}")

    def get_all(self):
        return self._config

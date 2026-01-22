import logging

import config
import requests

logger = logging.getLogger(__name__)


class JellyfinClient:
    def __init__(self):
        self.host = config.JELLYFIN_HOST
        self.api_key = config.JELLYFIN_API_KEY
        self.users = []

    def _get_headers(self):
        return {
            "X-Emby-Token": self.api_key,
            "X-Emby-Authorization": f'MediaBrowser Client="Media-Cleanerr", Device="Server", DeviceId="Media-Cleanerr", Version="1.0.0", Token="{self.api_key}"',
        }

    def get_users(self):
        if not self.host or not self.api_key:
            logger.warning("Jellyfin credentials not configured")
            return []

        try:
            base_url = self.host.rstrip("/")
            url = f"{base_url}/Users"
            headers = self._get_headers()

            response = requests.get(url, headers=headers)
            response.raise_for_status()
            self.users = response.json()
            return self.users
        except Exception as e:
            logger.error(f"Error fetching users from Jellyfin: {e}")
            return []

    def get_user_items(self, user_id):
        """Fetch all items for a specific user to check play state."""
        if not self.host or not self.api_key:
            return []

        try:
            base_url = self.host.rstrip("/")
            # IncludeItemTypes: Movie,Episode
            # Recursive: true to get all nested items
            # Fields: Path,ProviderIds so we can match
            url = f"{base_url}/Users/{user_id}/Items"
            params = {
                "Recursive": "true",
                "IncludeItemTypes": "Movie,Episode,Series",
                "Fields": "Path,ProviderIds,UserData",
            }
            headers = self._get_headers()

            response = requests.get(url, headers=headers, params=params)
            response.raise_for_status()
            return response.json().get("Items", [])
        except Exception as e:
            logger.error(f"Error fetching items for user {user_id} from Jellyfin: {e}")
            return []

    def get_all_items_with_play_status(self):
        """
        Aggregates items from all users and determines if they have been watched by at least one user.
        Returns a dictionary keyed by provider ID (e.g., imdb, tmdb, tvdb) or path?
        Provider IDs are safer for matching.
        Structure:
        {
            "tmdb_12345": {
                "watched": True,
                "title": "Movie Title"
            }
        }
        """
        if not self.users:
            self.get_users()

        aggregated_data = {}

        for user in self.users:
            user_id = user["Id"]
            items = self.get_user_items(user_id)

            for item in items:
                # Identification logic
                # Movies usually have tmdb/imdb. Episodes have tvdb usually.
                # We need a robust key. Let's try to use ProviderIds.
                provider_ids = item.get("ProviderIds", {})

                # Construct a composite key if possible, or list of keys
                # For simplicity, we might iterate and check matches later.
                # Let's just store by internal Jellyfin ID first, but also map provider IDs.

                # Check watched status
                user_data = item.get("UserData", {})
                is_played = user_data.get("Played", False)

                item_id = item["Id"]

                if item_id not in aggregated_data:
                    aggregated_data[item_id] = {
                        "Name": item.get("Name"),
                        "Path": item.get("Path"),
                        "ProviderIds": provider_ids,
                        "Type": item.get("Type"),
                        "Watched": is_played,
                    }
                else:
                    # If already exists, just OR the watched status (if watched by *at least one* user)
                    if is_played:
                        aggregated_data[item_id]["Watched"] = True

        return aggregated_data

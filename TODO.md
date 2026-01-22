# Project: Media-Cleanerr

## 1. Project Setup
- [x] Initialize Python project structure.
- [x] Create `requirements.txt` with dependencies (e.g., `flask`, `requests`, `qbittorrent-api` if available, or just raw requests).

## 2. API Clients Implementation
- [x] Create a configuration module to load settings from Environment Variables (`OS`, `HOST`, `API_KEY` etc. for each service).
- [x] **Radarr Client**:
    - [x] Implement function to fetch all movies.
- [x] **Sonarr Client**:
    - [x] Implement function to fetch all series/episodes.
- [x] **qBittorrent Client**:
    - [x] Implement function to fetch all torrents (with hashes and save paths).
- [x] **Jellyfin Client**:
    - [x] Implement function to fetch all users.
    - [x] Implement function to fetch library items.
    - [x] Implement function to check "Played" status for items for all users.

## 3. Core Logic (Data Correlation)
- [x] Match Radarr Movies to qBittorrent torrents (likely via path matching or hash if stored in history).
- [x] Match Sonarr Episodes to qBittorrent torrents.
- [x] Match Radarr/Sonarr entries to Jellyfin Media Items.
- [x] Aggregation logic: Create a unified list of media objects containing:
    - Name/Title
    - Source (Radarr/Sonarr)
    - Torrent Status (e.g., Seeding, Completed, Missing)
    - Watch Status (Watched by at least one user? Yes/No)

## 4. Web Application (Python/Flask)
- [x] Create a simple route `/` to display the data.
- [x] Create an HTML template to render the table of media.
- [x] (Optional) Add simple CSS for readability.

## 5. Dockerization
- [x] Create `Dockerfile` for the Python application.
- [x] Create `docker-compose.yml` to orchestrate the container.
    - Define services.
    - Define environment variables structure.

## 6. Testing & Refinement
- [ ] Verify connections to all services.
- [ ] accurate matching of media across services.
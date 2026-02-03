import axios, { AxiosInstance } from 'axios';
import { ConfigManager } from './config_manager';

export class SonarrClient {
  private host: string | undefined;
  private apiKey: string | undefined;
  private api: AxiosInstance | null = null;

  constructor() {
    const config = new ConfigManager();
    this.host = config.get('SONARR_HOST');
    this.apiKey = config.get('SONARR_API_KEY');

    if (this.host && this.apiKey) {
      this.api = axios.create({
        baseURL: `${this.host.replace(/\/$/, '')}/api/v3`,
        headers: {
          'X-Api-Key': this.apiKey,
        },
        timeout: 60000,
      });
    }
  }

  async get_series(): Promise<any[]> {
    if (!this.api) {
      console.warn('Sonarr credentials not configured');
      return [];
    }
    try {
      const response = await this.api.get('/series');
      return response.data;
    } catch (error) {
      console.error('Error fetching series from Sonarr:', error);
      return [];
    }
  }

  async get_episodes(seriesId: string | number): Promise<any[]> {
    if (!this.api) return [];
    try {
      const response = await this.api.get('/episode', {
        params: { seriesId },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching episodes for series ${seriesId} from Sonarr:`, error);
      return [];
    }
  }

  async get_history(pageSize: number = 1000): Promise<any[]> {
    if (!this.api) return [];
    try {
      const response = await this.api.get('/history', {
        params: { pageSize, includeEpisode: 'true' },
      });
      return response.data.records || [];
    } catch (error) {
      console.error('Error fetching history from Sonarr:', error);
      return [];
    }
  }

  async delete_series(seriesId: string | number): Promise<boolean> {
    if (!this.api) return false;
    try {
      await this.api.delete(`/series/${seriesId}`, {
        params: { deleteFiles: 'true' },
      });
      console.info(`Deleted series ${seriesId} from Sonarr.`);
      return true;
    } catch (error) {
      console.error(`Error deleting series ${seriesId} from Sonarr:`, error);
      return false;
    }
  }

  async check_connection(): Promise<boolean> {
    if (!this.api) return false;
    try {
      await this.api.get('/system/status', { timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }
}

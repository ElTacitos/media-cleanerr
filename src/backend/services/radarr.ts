import axios, { AxiosInstance } from 'axios';
import { ConfigManager } from './config_manager';

export class RadarrClient {
  private host: string | undefined;
  private apiKey: string | undefined;
  private api: AxiosInstance | null = null;

  constructor() {
    const config = new ConfigManager();
    this.host = config.get('RADARR_HOST');
    this.apiKey = config.get('RADARR_API_KEY');

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

  async get_movies(): Promise<any[]> {
    if (!this.api) {
      console.warn('Radarr credentials not configured');
      return [];
    }
    try {
      const response = await this.api.get('/movie');
      return response.data;
    } catch (error) {
      console.error('Error fetching data from Radarr:', error);
      return [];
    }
  }

  async get_history(pageSize: number = 1000): Promise<any[]> {
    if (!this.api) return [];
    try {
      const response = await this.api.get('/history', {
        params: { pageSize },
      });
      return response.data.records || [];
    } catch (error) {
      console.error('Error fetching history from Radarr:', error);
      return [];
    }
  }

  async delete_movie(movieId: string | number): Promise<boolean> {
    if (!this.api) return false;
    try {
      await this.api.delete(`/movie/${movieId}`, {
        params: { deleteFiles: 'true' },
      });
      console.info(`Deleted movie ${movieId} from Radarr.`);
      return true;
    } catch (error) {
      console.error(`Error deleting movie ${movieId} from Radarr:`, error);
      return false;
    }
  }

  async get_disk_space(): Promise<any[]> {
    if (!this.api) return [];
    try {
      const response = await this.api.get('/diskspace');
      return response.data;
    } catch (error) {
      console.error('Error fetching disk space from Radarr:', error);
      return [];
    }
  }

  async get_root_folders(): Promise<any[]> {
    if (!this.api) return [];
    try {
      const response = await this.api.get('/rootfolder');
      return response.data;
    } catch (error) {
      console.error('Error fetching root folders from Radarr:', error);
      return [];
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

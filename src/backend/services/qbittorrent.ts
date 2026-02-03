import axios, { AxiosInstance } from 'axios';
import { ConfigManager } from './config_manager';

export class QBitClient {
  private host: string | undefined;
  private username: string | undefined;
  private password: string | undefined;
  private api: AxiosInstance | null = null;
  private authenticated: boolean = false;
  private cookie: string | null = null;

  constructor() {
    const config = new ConfigManager();
    this.host = config.get('QBIT_HOST');
    this.username = config.get('QBIT_USERNAME');
    this.password = config.get('QBIT_PASSWORD');

    if (this.host) {
      this.api = axios.create({
        baseURL: `${this.host.replace(/\/$/, '')}/api/v2`,
        timeout: 60000,
      });
    }
  }

  async login(): Promise<boolean> {
    if (!this.api || !this.host) {
      console.warn('qBittorrent host not configured');
      return false;
    }

    try {
      const params = new URLSearchParams();
      params.append('username', this.username || '');
      params.append('password', this.password || '');

      const response = await this.api.post('/auth/login', params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (response.data === 'Fails.') {
        console.error('qBittorrent login failed.');
        this.authenticated = false;
        return false;
      }

      // Extract SID cookie for manual session management in Node.js
      const setCookie = response.headers['set-cookie'];
      if (setCookie && setCookie.length > 0) {
        this.cookie = setCookie[0].split(';')[0];
      }

      this.authenticated = true;
      return true;
    } catch (error) {
      console.error('Error logging into qBittorrent:', error);
      this.authenticated = false;
      return false;
    }
  }

  private getRequestConfig() {
    return {
      headers: this.cookie ? { Cookie: this.cookie } : {},
    };
  }

  async get_torrents(): Promise<any[]> {
    if (!this.api) return [];

    if (!this.authenticated) {
      if (!(await this.login())) return [];
    }

    try {
      const response = await this.api.get('/torrents/info', this.getRequestConfig());
      return response.data;
    } catch (error: any) {
      // If 403, session might have expired
      if (error.response?.status === 403) {
        console.info('Session expired, retrying login...');
        if (await this.login()) {
          try {
            const retryResponse = await this.api.get('/torrents/info', this.getRequestConfig());
            return retryResponse.data;
          } catch (retryError) {
            return [];
          }
        }
      }
      console.error('Error fetching torrents from qBittorrent:', error);
      return [];
    }
  }

  async delete_torrent(torrentHash: string): Promise<boolean> {
    if (!this.api || !torrentHash) return false;

    if (!this.authenticated) {
      if (!(await this.login())) return false;
    }

    try {
      const params = new URLSearchParams();
      params.append('hashes', torrentHash);
      params.append('deleteFiles', 'true');

      await this.api.post('/torrents/delete', params, {
        ...this.getRequestConfig(),
        headers: {
          ...this.getRequestConfig().headers,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });
      console.info(`Deleted torrent ${torrentHash} from qBittorrent.`);
      return true;
    } catch (error) {
      console.error(`Error deleting torrent ${torrentHash}:`, error);
      return false;
    }
  }

  async check_connection(): Promise<boolean> {
    return this.login();
  }
}

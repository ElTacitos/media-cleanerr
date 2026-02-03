import axios, { AxiosInstance } from 'axios';
import { ConfigManager } from './config_manager';

export class JellyfinClient {
  private host: string | undefined;
  private apiKey: string | undefined;
  private api: AxiosInstance | null = null;
  private users: any[] = [];

  constructor() {
    const config = new ConfigManager();
    this.host = config.get('JELLYFIN_HOST');
    this.apiKey = config.get('JELLYFIN_API_KEY');

    if (this.host && this.apiKey) {
      this.api = axios.create({
        baseURL: this.host.replace(/\/$/, ''),
        headers: this.get_headers(),
        timeout: 60000,
      });
    }
  }

  private get_headers() {
    return {
      'X-Emby-Token': this.apiKey,
      'X-Emby-Authorization': `MediaBrowser Client="Media-Cleanerr", Device="Server", DeviceId="Media-Cleanerr", Version="1.0.0", Token="${this.apiKey}"`,
    };
  }

  async get_users(): Promise<any[]> {
    if (!this.api) {
      console.warn('Jellyfin credentials not configured');
      return [];
    }

    try {
      const response = await this.api.get('/Users');
      this.users = response.data;
      return this.users;
    } catch (error) {
      console.error('Error fetching users from Jellyfin:', error);
      return [];
    }
  }

  async get_user_items(userId: string): Promise<any[]> {
    if (!this.api) return [];

    try {
      const response = await this.api.get(`/Users/${userId}/Items`, {
        params: {
          Recursive: 'true',
          IncludeItemTypes: 'Movie,Episode,Series',
          Fields: 'Path,ProviderIds,UserData',
        },
      });
      return response.data.Items || [];
    } catch (error) {
      console.error(`Error fetching items for user ${userId} from Jellyfin:`, error);
      return [];
    }
  }

  async get_all_items_with_play_status(): Promise<Record<string, any>> {
    if (this.users.length === 0) {
      await this.get_users();
    }

    const aggregatedData: Record<string, any> = {};

    for (const user of this.users) {
      const userId = user.Id;
      const items = await this.get_user_items(userId);

      for (const item of items) {
        const providerIds = item.ProviderIds || {};
        const userData = item.UserData || {};
        const isPlayed = userData.Played || false;
        const itemId = item.Id;

        if (!aggregatedData[itemId]) {
          aggregatedData[itemId] = {
            Name: item.Name,
            Path: item.Path,
            ProviderIds: providerIds,
            Type: item.Type,
            Watched: isPlayed,
          };
        } else {
          // If already exists, just OR the watched status (watched by at least one user)
          if (isPlayed) {
            aggregatedData[itemId].Watched = true;
          }
        }
      }
    }

    return aggregatedData;
  }

  async check_connection(): Promise<boolean> {
    if (!this.api) return false;
    try {
      await this.api.get('/System/Info', { timeout: 5000 });
      return true;
    } catch (error) {
      return false;
    }
  }
}

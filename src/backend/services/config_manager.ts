import fs from 'fs';
import path from 'path';

export interface Config {
  RADARR_HOST?: string;
  RADARR_API_KEY?: string;
  SONARR_HOST?: string;
  SONARR_API_KEY?: string;
  QBIT_HOST?: string;
  QBIT_USERNAME?: string;
  QBIT_PASSWORD?: string;
  JELLYFIN_HOST?: string;
  JELLYFIN_API_KEY?: string;
  DISK_THRESHOLD: number;
  MIN_SEED_WEEKS: number;
  MIN_RATIO: number;
}

export class ConfigManager {
  private configPath: string;
  private defaultConfig: Config = {
    DISK_THRESHOLD: 90,
    MIN_SEED_WEEKS: 4,
    MIN_RATIO: 1.0,
  };

  constructor() {
    this.configPath = path.join(process.cwd(), 'config', 'config.json');
    if (!fs.existsSync(path.dirname(this.configPath))) {
      fs.mkdirSync(path.dirname(this.configPath), { recursive: true });
    }
  }

  get_all(): Config {
    if (!fs.existsSync(this.configPath)) {
      return { ...this.defaultConfig };
    }
    try {
      const data = fs.readFileSync(this.configPath, 'utf8');
      return { ...this.defaultConfig, ...JSON.parse(data) };
    } catch (error) {
      console.error('Error reading config:', error);
      return { ...this.defaultConfig };
    }
  }

  get<K extends keyof Config>(key: K, defaultValue?: Config[K]): Config[K] {
    const config = this.get_all();
    return config[key] ?? defaultValue ?? (this.defaultConfig[key as keyof Config] as any);
  }

  update(newConfig: Partial<Config>): void {
    const currentConfig = this.get_all();
    const updatedConfig = { ...currentConfig, ...newConfig };
    fs.writeFileSync(this.configPath, JSON.stringify(updatedConfig, null, 2));
  }
}

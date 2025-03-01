import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { Logger, LogLevel } from '../core/Logger';

export interface ChannelPair {
  DISCORD_CHANNEL_ID: string;
  TELEGRAM_CHAT_ID: number;
  TELEGRAM_THREAD_ID?: number;
}

export interface AppConfig {
  DISCORD_TOKEN: string;
  TELEGRAM_TOKEN: string;
  CHANNEL_PAIRS: ChannelPair[];
}

export class ConfigLoader {
  private static logger = new Logger({ logLevel: LogLevel.INFO });

  static load(): AppConfig {
    try {
      const fileContents = fs.readFileSync('env.yaml', 'utf8');
      const config = yaml.load(fileContents) as AppConfig;
      this.validate(config);
      this.logger.info('Configuration loaded successfully');
      return config;
    } catch (error) {
      this.logger.error('Failed to load config', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  private static validate(config: AppConfig): void {
    const requiredFields: (keyof AppConfig)[] = ['DISCORD_TOKEN', 'TELEGRAM_TOKEN', 'CHANNEL_PAIRS'];
    requiredFields.forEach(field => {
      if (!config[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    });

    if (!Array.isArray(config.CHANNEL_PAIRS)) {
      throw new Error('CHANNEL_PAIRS must be an array');
    }

    config.CHANNEL_PAIRS.forEach((pair, index) => {
      if (!pair.DISCORD_CHANNEL_ID || !pair.TELEGRAM_CHAT_ID) {
        throw new Error(`Missing DISCORD_CHANNEL_ID or TELEGRAM_CHAT_ID in pair #${index + 1}`);
      }
      if (typeof pair.DISCORD_CHANNEL_ID !== 'string' || isNaN(pair.TELEGRAM_CHAT_ID)) {
        throw new Error(`Invalid type in pair #${index + 1}`);
      }
    });
  }
}
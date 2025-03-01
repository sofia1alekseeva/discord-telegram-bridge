import { Client, ClientOptions, GatewayIntentBits, Message, PartialMessage, TextChannel } from 'discord.js';
import { EventEmitter } from 'events';
import { Logger, LogLevel } from '../core/Logger';

export class DiscordClient {
  private readonly client: Client;
  private readonly logger = new Logger({ logLevel: LogLevel.INFO });

  constructor(options: ClientOptions, private readonly eventEmitter: EventEmitter) {
    this.client = new Client(options);
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.client.on('messageCreate', (message: Message) => this.eventEmitter.emit('messageCreated', message));
    this.client.on('messageUpdate', (_: Message | PartialMessage, newMessage: Message | PartialMessage) =>
      this.eventEmitter.emit('messageUpdated', newMessage)
    );
    this.client.on('messageDelete', (message: Message | PartialMessage) =>
      this.eventEmitter.emit('messageDeleted', message)
    );
    this.client.on('ready', () => this.eventEmitter.emit('ready'));
    this.client.on('error', error => this.logger.error('Discord client error', { error }));
  }

  async login(token: string): Promise<void> {
    await this.client.login(token);
    this.logger.info('Discord client logged in');
  }

  async fetchChannel(channelId: string): Promise<TextChannel | null> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      return channel instanceof TextChannel ? channel : null;
    } catch (error) {
      this.logger.error('Failed to fetch channel', { channelId, error });
      return null;
    }
  }

  async fetchMessages(channelId: string, limit: number): Promise<Message[]> {
    const channel = await this.fetchChannel(channelId);
    if (!channel) return [];
    const messages = await channel.messages.fetch({ limit });
    this.logger.debug('Fetched messages', { channelId, count: messages.size });
    return Array.from(messages.values());
  }
}

export const createDiscordClientOptions = (): ClientOptions => ({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  rest: { timeout: 30000 },
});
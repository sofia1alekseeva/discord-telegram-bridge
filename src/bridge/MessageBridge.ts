import { EventEmitter } from 'events';
import { DiscordClient, createDiscordClientOptions } from '../clients/DiscordClient';
import { MessageProcessor } from '../core/MessageProcessor';
import { Message } from 'discord.js';
import { Logger, LogLevel } from '../core/Logger';

interface SentMessageData {
  discordMessageId: string;
  channelId: string;
}

export class MessageBridge {
  private readonly discordClient: DiscordClient;
  private readonly logger = new Logger({ logLevel: LogLevel.INFO });

  constructor(
    private readonly processor: MessageProcessor,
    eventEmitter: EventEmitter,
    discordOptions = createDiscordClientOptions()
  ) {
    this.discordClient = new DiscordClient(discordOptions, eventEmitter);
    this.setupEventListeners(eventEmitter);
  }

  private setupEventListeners(eventEmitter: EventEmitter): void {
    eventEmitter.on('messageCreated', (msg: Message) => this.processor.processNewMessage(msg));
    eventEmitter.on('messageUpdated', (msg: Message) => this.processor.processUpdatedMessage(msg));
    eventEmitter.on('messageDeleted', (msg: Message) => this.processor.processDeletedMessage(msg));
    eventEmitter.on('ready', () => this.handleReady());
  }

  private async handleReady(): Promise<void> {
    this.logger.info('Bot is ready');
    const sentMessages = await this.sendRecentMessages(1);
    setTimeout(() => this.deleteMessages(sentMessages), 5000);
  }

  async sendRecentMessages(limit: number): Promise<SentMessageData[]> {
    const sentMessages: SentMessageData[] = [];

    for (const pair of this.processor['CHANNEL_PAIRS']) {
      this.logger.debug('Fetching recent messages', { channelId: pair.DISCORD_CHANNEL_ID });
      const messages = await this.discordClient.fetchMessages(pair.DISCORD_CHANNEL_ID, limit);
      for (const message of messages.reverse()) {
        await this.processor.processNewMessage(message);
        sentMessages.push({
          discordMessageId: message.id,
          channelId: pair.DISCORD_CHANNEL_ID,
        });
      }
    }
    this.logger.info('Recent messages sent', { count: sentMessages.length });
    return sentMessages;
  }

  async deleteMessages(sentMessages: SentMessageData[]): Promise<void> {
    let deletedCount = 0;
    const telegramClient = this.processor['telegramClient']; // Доступ к TelegramClient
    const store = this.processor['store']; // Доступ к MessageStore

    for (const { discordMessageId } of sentMessages) {
      try {
        const data = store.get(discordMessageId);
        if (!data) {
          this.logger.warn('No Telegram data found for message', { discordMessageId });
          continue;
        }

        await Promise.all([
          telegramClient.deleteMessage(data.telegramChatId, data.messageId, data.telegramThreadId),
          ...data.mediaIds.map(id =>
            telegramClient.deleteMessage(data.telegramChatId, parseInt(id), data.telegramThreadId).catch(() => null)
          ),
        ]);
        store.delete(discordMessageId);
        this.logger.debug('Message deleted', { discordMessageId });
        deletedCount++;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.logger.error('Failed to delete message', { discordMessageId, error: errorMessage });
      }
    }
    this.logger.info('Messages deletion completed', { attempted: sentMessages.length, succeeded: deletedCount });
  }

  start(DISCORD_TOKEN: string): void {
    this.discordClient.login(DISCORD_TOKEN).catch(error => {
      this.logger.error('Failed to start Discord client', { error });
      process.exit(1);
    });
  }
}
import { Message, PartialMessage } from 'discord.js';
import { TelegramClient, TelegramMessageData } from '../clients/TelegramClient';
import { MessageStore } from './MessageStore';
import { ChannelPair } from '../config/ConfigLoader';
import { Logger, LogLevel } from './Logger';
import { escapeUnpairedSymbols } from '../utils/markdown';

export class MessageProcessor {
  private readonly logger = new Logger({ logLevel: LogLevel.INFO });

  constructor(
    private readonly telegramClient: TelegramClient,
    private readonly store: MessageStore,
    private readonly CHANNEL_PAIRS: ChannelPair[]
  ) {}

  async processNewMessage(message: Message): Promise<void> {
    if (!this.shouldProcess(message) || this.store.has(message.id)) return;
    this.logger.info('Processing new message', { messageId: message.id, channelId: message.channel.id });
    const telegramData = await this.sendToTelegram(message);
    this.store.save(message.id, telegramData);
  }

  async processUpdatedMessage(message: Message | PartialMessage): Promise<void> {
    if (!this.shouldProcess(message)) return;
    const fullMessage = message as Message;
    this.logger.info('Processing updated message', { messageId: fullMessage.id });
    await this.deleteFromTelegram(fullMessage.id);
    const telegramData = await this.sendToTelegram(fullMessage);
    this.store.save(fullMessage.id, telegramData);
  }

  async processDeletedMessage(message: Message | PartialMessage): Promise<void> {
    if (!this.shouldProcess(message)) return;
    this.logger.info('Processing deleted message', { messageId: message.id });
    await this.deleteFromTelegram(message.id);
  }

  private shouldProcess(message: Message | PartialMessage): boolean {
    return (
      this.CHANNEL_PAIRS.some(pair => pair.DISCORD_CHANNEL_ID === message.channel.id) &&
      !!(message.content || message.attachments?.size)
    );
  }

  private async sendToTelegram(message: Message): Promise<TelegramMessageData> {
    const pair = this.findChannelPair(message.channel.id);
    if (!pair) {
      this.logger.warn('No channel pair found', { channelId: message.channel.id });
      throw new Error(`No channel pair found for ${message.channel.id}`);
    }

    const text = this.formatMessageText(message);
    const attachments = Array.from(message.attachments.values());

    return attachments.length
      ? await this.sendMediaGroup(pair, text, attachments)
      : await this.telegramClient.sendTextMessage(
          pair.TELEGRAM_CHAT_ID.toString(),
          text,
          pair.TELEGRAM_THREAD_ID
        );
  }

  private formatMessageText(message: Message): string {
    return `*${message.author.displayName}*:\n${message.content}`;
  }

  private async sendMediaGroup(pair: ChannelPair, text: string, attachments: any[]): Promise<TelegramMessageData> {
    const media = attachments.map((attachment) => ({
      type: 'photo' as const,
      media: attachment.url,
      caption: text ? escapeUnpairedSymbols(text) : '',
      parse_mode: 'Markdown' as const,
    }));
    return await this.telegramClient.sendMediaGroup(
      pair.TELEGRAM_CHAT_ID.toString(),
      media,
      pair.TELEGRAM_THREAD_ID
    );
  }

  private async deleteFromTelegram(discordMessageId: string): Promise<void> {
    const data = this.store.get(discordMessageId);
    if (!data) return;

    await Promise.all([
      this.telegramClient.deleteMessage(data.telegramChatId, data.messageId, data.telegramThreadId),
      ...data.mediaIds.map(id =>
        this.telegramClient.deleteMessage(data.telegramChatId, parseInt(id), data.telegramThreadId).catch(() => null)
      ),
    ]);
    this.store.delete(discordMessageId);
  }

  private findChannelPair(channelId: string): ChannelPair | undefined {
    return this.CHANNEL_PAIRS.find(pair => pair.DISCORD_CHANNEL_ID === channelId);
  }
}
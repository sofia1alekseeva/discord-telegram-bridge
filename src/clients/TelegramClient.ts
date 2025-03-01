import TelegramBot, { InputMedia, SendMediaGroupOptions } from 'node-telegram-bot-api';
import { Logger, LogLevel } from '../core/Logger';

interface SendMediaGroupOptionsExtra extends SendMediaGroupOptions {
  message_thread_id?: number;
}

export interface TelegramMessageData {
  messageId: number;
  mediaIds: string[];
  telegramChatId: string;
  telegramThreadId?: number;
}

export class TelegramClient {
  private readonly bot: TelegramBot;
  private readonly logger = new Logger({ logLevel: LogLevel.INFO });

  constructor(token: string) {
    this.bot = new TelegramBot(token, { polling: true });
    this.bot.on('error', error => this.logger.error('Telegram client error', { error }));
  }

  async sendTextMessage(chatId: string, text: string, threadId?: number): Promise<TelegramMessageData> {
    const options = { parse_mode: 'Markdown' as const, message_thread_id: threadId };
    const sentMessage = await this.bot.sendMessage(chatId, text, options);
    this.logger.debug('Sent text message to Telegram', { chatId, messageId: sentMessage.message_id });
    return {
      messageId: sentMessage.message_id,
      mediaIds: [],
      telegramChatId: chatId,
      telegramThreadId: threadId,
    };
  }

  async sendMediaGroup(chatId: string, media: InputMedia[], threadId?: number): Promise<TelegramMessageData> {
    const options: SendMediaGroupOptionsExtra = { message_thread_id: threadId };
    const sentMedia = await this.bot.sendMediaGroup(chatId, media, options);
    this.logger.debug('Sent media group to Telegram', { chatId, messageIds: sentMedia.map(m => m.message_id) });
    return {
      messageId: sentMedia[0].message_id,
      mediaIds: sentMedia.map(m => m.message_id.toString()),
      telegramChatId: chatId,
      telegramThreadId: threadId,
    };
  }

  async deleteMessage(chatId: string, messageId: number, threadId?: number): Promise<void> {
    await this.bot.deleteMessage(chatId, messageId, { message_thread_id: threadId });
    this.logger.debug('Deleted message from Telegram', { chatId, messageId });
  }
}
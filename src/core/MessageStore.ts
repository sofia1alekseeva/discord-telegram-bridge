import { TelegramMessageData } from '../clients/TelegramClient';

export class MessageStore {
  private readonly store = new Map<string, TelegramMessageData>();

  save(discordMessageId: string, data: TelegramMessageData): void {
    this.store.set(discordMessageId, data);
  }

  get(discordMessageId: string): TelegramMessageData | undefined {
    return this.store.get(discordMessageId);
  }

  delete(discordMessageId: string): void {
    this.store.delete(discordMessageId);
  }

  has(discordMessageId: string): boolean {
    return this.store.has(discordMessageId);
  }
}
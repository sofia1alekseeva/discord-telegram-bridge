import { EventEmitter } from 'events';
import { ConfigLoader } from './config/ConfigLoader';
import { DiscordClient } from './clients/DiscordClient';
import { TelegramClient } from './clients/TelegramClient';
import { MessageStore } from './core/MessageStore';
import { MessageProcessor } from './core/MessageProcessor';
import { MessageBridge } from './bridge/MessageBridge';
import { Logger, LogLevel } from './core/Logger';

function main(): void {
  const logger = new Logger({
    logLevel: LogLevel.INFO,
    logFilePath: 'logs/bot.log',
  });

  try {
    const config = ConfigLoader.load();
    const eventEmitter = new EventEmitter();
    const telegramClient = new TelegramClient(config.TELEGRAM_TOKEN);
    const store = new MessageStore();
    const processor = new MessageProcessor(telegramClient, store, config.CHANNEL_PAIRS);
    const bridge = new MessageBridge(processor, eventEmitter);

    bridge.start(config.DISCORD_TOKEN);

    process.on('SIGINT', () => {
      logger.info('Bot stopped');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Startup error', { error });
    process.exit(1);
  }
}

main();
import * as winston from 'winston';
import TelegramBot from 'node-telegram-bot-api';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'telegram-mentions.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

export interface MentionLog {
  telegramEvent: string;
  user: {
    id?: number;
    username?: string;
    firstName?: string;
    lastName?: string;
  };
  chat: {
    id: number;
    type: string;
    title?: string;
    threadId?: number;
  };
  message: {
    id: number;
    text?: string;
    date: Date;
  };
}

export const initMentionLogger = (bot: TelegramBot) => {
  let botUsername: string;

  bot.getMe()
    .then((me) => {
      botUsername = me.username?.toLowerCase() || '';
      logger.info(`Telegram Bot @${botUsername} started listening`);

      bot.on('message', (msg) => {
        try {
          if (!msg.text || !msg.entities) return;

          const mentions = msg.entities
            .filter(e => e.type === 'mention')
            .map(e => {
              return msg.text!.substring(e.offset, e.offset + e.length).toLowerCase();
            });

          if (mentions.includes(`@${botUsername}`)) {
            const logEntry: MentionLog = {
              telegramEvent: 'mention',
              user: {
                id: msg.from?.id,
                username: msg.from?.username,
                firstName: msg.from?.first_name,
                lastName: msg.from?.last_name,
              },
              chat: {
                id: msg.chat.id,
                threadId: msg.message_thread_id,
                type: msg.chat.type,
                title: msg.chat.title,
              },
              message: {
                id: msg.message_id,
                text: msg.text,
                date: new Date(msg.date * 1000),
              }
            };

            logger.info('Bot mention detected', logEntry);

            // Опциональный ответ
            bot.sendMessage(
              msg.chat.id,
              `Упоминание зарегистрировано [${msg.message_id}]`,
              {
                reply_to_message_id: msg.message_id,
                message_thread_id: msg.message_thread_id
              }
            );
          }
        } catch (error) {
          logger.error('Error processing Telegram message:', error);
        }
      });
    })
    .catch((error) => {
      logger.error('Failed to get Telegram bot info:', error);
      process.exit(1);
    });

  bot.on('polling_error', (error) => {
    logger.error('Telegram polling error:', error);
  });
};
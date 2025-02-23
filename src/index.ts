import { Client, ClientOptions, GatewayIntentBits, Message, PartialMessage, TextChannel } from 'discord.js';
import TelegramBot, { InputMedia, SendMediaGroupOptions } from 'node-telegram-bot-api';
import * as fs from 'fs';

// Загрузка конфигурации из env.json
const envConfig = JSON.parse(fs.readFileSync('env.json', 'utf8'));

// Проверка обязательных переменных
const requiredEnvVars = ['DISCORD_TOKEN', 'TELEGRAM_TOKEN', 'CHANNEL_PAIRS'];

const checkRequiredEnvVars = (config: any, requiredVars: string[]) => {
  requiredVars.forEach(varName => {
    if (!config[varName]) {
      console.error(`Missing required variable: ${varName}`);
      process.exit(1);
    }
  });
};
checkRequiredEnvVars(envConfig, requiredEnvVars);

console.log('Загруженные пары каналов:');
envConfig.CHANNEL_PAIRS.forEach((pair: any, index: number) => {
  console.log(`Пара #${index + 1}:`);
  console.log(`  Discord: ${pair.DISCORD_CHANNEL_ID}`);
  console.log(`  Telegram Chat: ${pair.TELEGRAM_CHAT_ID}`);
  console.log(`  Telegram Thread: ${pair.TELEGRAM_THREAD_ID || 'Нет'}`);
});

  interface SendMediaGroupOptionsExtra extends SendMediaGroupOptions {
    message_thread_id?: number;
  }
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'Reason:', reason);
  process.exit(1);
});

// Интерфейс для пар каналов
interface ChannelPair {
  DISCORD_CHANNEL_ID: string;
  TELEGRAM_CHAT_ID: number;
  TELEGRAM_THREAD_ID?: number;
}

const channelPairs: ChannelPair[] = envConfig.CHANNEL_PAIRS.map((pair: any) => {
  if (!pair.DISCORD_CHANNEL_ID || pair.TELEGRAM_CHAT_ID === undefined) {
    throw new Error('Each pair must have DISCORD_CHANNEL_ID and TELEGRAM_CHAT_ID');
  }
  return {
    DISCORD_CHANNEL_ID: String(pair.DISCORD_CHANNEL_ID),
    TELEGRAM_CHAT_ID: Number(pair.TELEGRAM_CHAT_ID),
    TELEGRAM_THREAD_ID: pair.TELEGRAM_THREAD_ID ? Number(pair.TELEGRAM_THREAD_ID) : undefined
  };
});

interface TelegramMessageData {
  messageId: number;
  mediaIds: string[];
  telegramChatId: string;
  telegramThreadId?: number;
}


const messageStore = new Map<string, TelegramMessageData>();
const discordOptions: ClientOptions = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  rest: {
    timeout: 30000
  }
};

const discordClient = new Client(discordOptions);
const telegramBot = new TelegramBot(envConfig.TELEGRAM_TOKEN);

// Отправка сообщения с медиа
async function sendToTelegram(message: Message): Promise<void> {
  try {
    const pair = channelPairs.find(p => p.DISCORD_CHANNEL_ID === message.channel.id);
    if (!pair) return;

    const text = `*${message.author.displayName}* (Discord):\n${message.content}`;
    const media = Array.from(message.attachments.values());

    let telegramMessageId: number;
    const mediaIds: string[] = [];

    const telegramOptions = {
      parse_mode: 'Markdown' as const,
      message_thread_id: pair.TELEGRAM_THREAD_ID
    };

    if (media.length > 0) {
      const mediaGroup: InputMedia[] = media.map((a, i) => ({
        type: 'photo',
        media: a.url,
        caption: i === 0 ? text : undefined,
        parse_mode: 'Markdown'
      }));

      const sentMedia = await telegramBot.sendMediaGroup(
        pair.TELEGRAM_CHAT_ID.toString(),
        mediaGroup,
        telegramOptions as SendMediaGroupOptionsExtra
      );

      telegramMessageId = sentMedia[0].message_id;
      mediaIds.push(...sentMedia.map(m => m.message_id.toString()));
    } else {
      const sentMessage = await telegramBot.sendMessage(
        pair.TELEGRAM_CHAT_ID.toString(),
        text,
        telegramOptions
      );
      telegramMessageId = sentMessage.message_id;
    }

    messageStore.set(message.id, {
      messageId: telegramMessageId,
      mediaIds,
      telegramChatId: pair.TELEGRAM_CHAT_ID.toString(),
      telegramThreadId: pair.TELEGRAM_THREAD_ID 
    });

  } catch (error) {
    console.error('Ошибка отправки:', error);
  }
}

// Редактирование сообщения
async function editInTelegram(message: Message | PartialMessage): Promise<void> {
  try {
    const data = messageStore.get(message.id);
    if (!data) return;

    await deleteFromTelegram(message.id);
    await sendToTelegram(message as Message);

  } catch (error) {
    console.error('Ошибка редактирования:', error);
  }
}

// Удаление сообщения
async function deleteFromTelegram(messageId: string): Promise<void> {
  try {
    const data = messageStore.get(messageId);
    if (!data) return;

    const deleteOptions = {
      message_thread_id: data.telegramThreadId
    };

    await Promise.all([
      telegramBot.deleteMessage(data.telegramChatId, data.messageId, deleteOptions),
      ...data.mediaIds.map(id => 
        telegramBot.deleteMessage(data.telegramChatId, parseInt(id), deleteOptions)
          .catch(() => null)
      )
    ]);

    messageStore.delete(messageId);
  } catch (error) {
    console.error('Ошибка удаления:', error);
  }
}

// Отправка последних сообщений
async function sendLastMessages(limit: number): Promise<void> {
  try {
    for (const pair of channelPairs) {
      const channel = (await discordClient.channels.fetch(pair.DISCORD_CHANNEL_ID)) as TextChannel;
      if (!channel) {
        console.error(`Канал ${pair.DISCORD_CHANNEL_ID} не найден`);
        continue;
      }

      const messages = await channel.messages.fetch({ limit });
      const messagesArray = Array.from(messages.values()).reverse();
      for (const message of messagesArray) {
        if (shouldProcessMessage(message)) {
          await sendToTelegram(message);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      console.log(`Последние ${limit} сообщений из ${pair.DISCORD_CHANNEL_ID} отправлены в ${pair.TELEGRAM_CHAT_ID}`);
    }
  } catch (error) {
    console.error('Ошибка при отправке истории:', error);
  }
}

// Проверка сообщения
function shouldProcessMessage(message: Message | PartialMessage): boolean {
  return !!(
    channelPairs.some(pair => pair.DISCORD_CHANNEL_ID === message.channel.id) &&
    !message.author?.bot &&
    (message.content || message.attachments.size > 0)
  );
}

// Обработчики событий
discordClient.on('messageCreate', async (message) => {
  if (shouldProcessMessage(message)) {
    await sendToTelegram(message);
  }
  console.log(`📩 Новое сообщение в канале ${message.channel.id}`);
});

discordClient.on('messageUpdate', async (oldMsg, newMsg) => {
  if (shouldProcessMessage(newMsg)) {
    await editInTelegram(newMsg);
  }
});

discordClient.on('messageDelete', async (message) => {
  if (shouldProcessMessage(message)) {
    await deleteFromTelegram(message.id);
  }
});

discordClient.on('ready', () => {
  console.log('✅ Бот подключен к Discord');
  channelPairs.forEach(pair => {
    const channel = discordClient.channels.cache.get(pair.DISCORD_CHANNEL_ID);
    if (!channel) {
      console.error(`❌ Канал ${pair.DISCORD_CHANNEL_ID} не найден!`);
      return;
    }
    console.log(`📢 Бот слушает канал: ${(channel as TextChannel).name} -> Telegram ${pair.TELEGRAM_CHAT_ID}${pair.TELEGRAM_THREAD_ID ? ` (Thread ${pair.TELEGRAM_THREAD_ID})` : ''}`);
  });
  sendLastMessages(1);
});

// Запуск бота
discordClient.login(envConfig.DISCORD_TOKEN)
  .then(() => console.log('Discord bot connected'))
  .catch(error => console.error('Discord login error:', error));

discordClient.on('error', error => console.error('Discord error:', error));
telegramBot.on('error', error => console.error('Telegram error:', error));

process.on('SIGINT', () => {
  discordClient.destroy();
  console.log('Bot stopped');
  process.exit();
});
import { Client, ClientOptions, GatewayIntentBits, Message, PartialMessage, TextChannel } from 'discord.js';
import TelegramBot, { InputMedia, SendMediaGroupOptions } from 'node-telegram-bot-api';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { exit } from 'process';

interface AppConfig {
  DISCORD_TOKEN: string;
  TELEGRAM_TOKEN: string;
  CHANNEL_PAIRS: Array<{
    DISCORD_CHANNEL_ID: string;
    TELEGRAM_CHAT_ID: number;
    TELEGRAM_THREAD_ID?: number;
  }>;
}

const loadConfig = (): AppConfig => {
  try {
    const fileContents = fs.readFileSync('env.yaml', 'utf8');
    return yaml.load(fileContents) as AppConfig;
  } catch (e) {
    console.error('Config load error:', e);
    exit(1);
  }
};

const envConfig = loadConfig();

const checkConfig = (config: AppConfig) => {
  const requiredRootKeys: (keyof AppConfig)[] = [
    'DISCORD_TOKEN',
    'TELEGRAM_TOKEN',
    'CHANNEL_PAIRS'
  ];

  requiredRootKeys.forEach(key => {
    if (config[key] === undefined || config[key] === null) {
      throw new Error(`Missing required root key: ${String(key)}`);
    }
  });

  if (!Array.isArray(config.CHANNEL_PAIRS)) {
    throw new Error('CHANNEL_PAIRS must be an array');
  }

  config.CHANNEL_PAIRS.forEach((pair, index) => {
    const requiredPairKeys: (keyof AppConfig['CHANNEL_PAIRS'][number])[] = [
      'DISCORD_CHANNEL_ID',
      'TELEGRAM_CHAT_ID'
    ];

    requiredPairKeys.forEach(key => {
      if (!pair[key]) {
        throw new Error(`Missing ${String(key)} in pair #${index + 1}`);
      }
    });

    if (typeof pair.DISCORD_CHANNEL_ID !== 'string') {
      throw new Error(`DISCORD_CHANNEL_ID must be string in pair #${index + 1}`);
    }

    if (isNaN(Number(pair.TELEGRAM_CHAT_ID))) {
      throw new Error(`TELEGRAM_CHAT_ID must be a number in pair #${index + 1}`);
    }
  });
};

try {
  checkConfig(envConfig);
} catch (e) {
  console.error('Ошибка конфигурации:', e);
  exit(1);
}

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

interface ChannelPair {
  DISCORD_CHANNEL_ID: string;
  TELEGRAM_CHAT_ID: number;
  TELEGRAM_CHAT_NAME?: string;
  TELEGRAM_THREAD_ID?: number;
}

const channelPairs: ChannelPair[] = envConfig.CHANNEL_PAIRS.map(pair => ({
  DISCORD_CHANNEL_ID: String(pair.DISCORD_CHANNEL_ID),
  TELEGRAM_CHAT_ID: Number(pair.TELEGRAM_CHAT_ID),
  TELEGRAM_THREAD_ID: pair.TELEGRAM_THREAD_ID ? Number(pair.TELEGRAM_THREAD_ID) : undefined
}));

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
      const discordChannel = (await discordClient.channels.fetch(pair.DISCORD_CHANNEL_ID)) as TextChannel;
      if (!discordChannel) {
        console.error(`❌ Discord канал ${pair.DISCORD_CHANNEL_ID} не найден`);
        continue;
      }

      let telegramChatName = `ID: ${pair.TELEGRAM_CHAT_ID}`;
      try {
        const chatInfo = await telegramBot.getChat(pair.TELEGRAM_CHAT_ID.toString());
        telegramChatName = chatInfo.title || telegramChatName;
      } catch (error) {
        console.error(`Не удалось получить название чата ${pair.TELEGRAM_CHAT_ID}:`, error);
      }

      const threadInfo = pair.TELEGRAM_THREAD_ID 
        ? ` (Тред ID: ${pair.TELEGRAM_THREAD_ID})` 
        : '';

      const messages = await discordChannel.messages.fetch({ limit });
      const messagesArray = Array.from(messages.values()).reverse();

      let sentCount = 0;
      for (const message of messagesArray) {
        if (shouldProcessMessage(message)) {
          await sendToTelegram(message);
          sentCount++;
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      console.log(`Последние ${limit} сообщений из $${discordChannel.name} отправлены в ${telegramChatName}${threadInfo}`);
    }
  } catch (error) {
    console.error('🚨 Критическая ошибка при отправке последних сообщений:', error);
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

discordClient.on('ready', async () => {
  console.log('✅ Бот подключен к Discord');

  for (const pair of channelPairs) {
    try {
      const discordChannel = await discordClient.channels.fetch(pair.DISCORD_CHANNEL_ID) as TextChannel;
      if (!discordChannel) {
        console.error(`❌ Discord канал ${pair.DISCORD_CHANNEL_ID} не найден!`);
        continue;
      }

      const chat = await telegramBot.getChat(pair.TELEGRAM_CHAT_ID.toString());
      const chatName = chat.title || `Чат ID: ${pair.TELEGRAM_CHAT_ID}`;

      const threadInfo = pair.TELEGRAM_THREAD_ID 
        ? ` (Thread ID: ${pair.TELEGRAM_THREAD_ID})` 
        : '';

      console.log(
        `📢 Бот слушает канал: ${discordChannel.name} -> ` +
        `Telegram ${chatName}${threadInfo}`
      );

    } catch (error) {
      console.error(`Ошибка обработки пары ${pair.DISCORD_CHANNEL_ID}:`, error);
    }
  }

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
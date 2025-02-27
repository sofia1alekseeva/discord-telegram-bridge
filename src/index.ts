import { Client, ClientOptions, GatewayIntentBits, Message, PartialMessage, PermissionsBitField, TextChannel } from 'discord.js';
import TelegramBot, { InputMedia, SendMediaGroupOptions } from 'node-telegram-bot-api';
import { initMentionLogger, logger } from './telegram/mentionLogger';
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
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageTyping,
    GatewayIntentBits.DirectMessages
  ],
  rest: {
    timeout: 30000
  }
};

const discordClient = new Client(discordOptions);
const telegramBot = new TelegramBot(envConfig.TELEGRAM_TOKEN, {
  polling: true
});

initMentionLogger(telegramBot);


async function sendToTelegram(message: Message): Promise<void> {
  try {
    console.log('🔎 Начало обработки сообщения:', {
      id: message.id,
      channel: message.channel.id,
      author: message.author?.tag,
      content: message.content.substring(0, 50) + '...',
      attachments: message.attachments.size
    });

    const pair = channelPairs.find(p => p.DISCORD_CHANNEL_ID === message.channel.id);
    if (!pair) {
      console.error('🚫 Канал не найден в конфигурации:', message.channel.id);
      return;
    }

    console.log('🔗 Найдена связка каналов:', {
      discord: pair.DISCORD_CHANNEL_ID,
      telegram: pair.TELEGRAM_CHAT_ID,
      thread: pair.TELEGRAM_THREAD_ID
    });

    const text = `*${message.author.displayName}*:\n${message.content}`;
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

  } catch (error:any) {
    console.error('💥 Критическая ошибка:', {
      error: error.message,
      stack: error.stack
    });
  }
}

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

async function sendLastMessages(limit: number, autoDelete: boolean = true, deleteTimeout: number = 5000): Promise<void> {
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
          if (!messageStore.has(message.id)) {
            await sendToTelegram(message);
            sentCount++;
            if (autoDelete) {
              setTimeout(async () => {
                try {
                  await deleteFromTelegram(message.id);
                  console.log(`🗑️ Сообщение ${message.id} удалено из Telegram через ${deleteTimeout} секунд`);
                } catch (error) {
                  console.error(`Ошибка при удалении сообщения ${message.id}:`, error);
                }
              }, deleteTimeout);
            } else {
              console.log(`⏳ Сообщение ${message.id} оставлено в Telegram (autoDelete отключено)`);
            }

            await new Promise(resolve => setTimeout(resolve, 500)); 
          } else {
            console.log(`⏩ Сообщение ${message.id} уже отправлено, пропускаем`);
          }
        }
      }
      console.log(`Отправлено ${sentCount} новых сообщений из ${discordChannel.name} в ${telegramChatName}${threadInfo}`);
    }
  } catch (error) {
    console.error('🚨 Критическая ошибка при отправке последних сообщений:', error);
  }
}

function shouldProcessMessage(message: Message | PartialMessage): boolean {
  const channelCheck = channelPairs.some(pair => {
    const match = pair.DISCORD_CHANNEL_ID === message.channel.id;
    // console.log(`🔍 Проверка канала ${message.channel.id}: ${match ? '✅ Совпадение' : '🚫 Не совпадает'}`);
    return match;
  });


  const hasContent = !!(message.content || message.attachments?.size > 0);
  
  // console.log(`📋 Критерии обработки для сообщения ${message.id}:`, {
  //   channelCheck,
  //   hasContent,
  //   shouldProcess: channelCheck && hasContent
  // });

  return channelCheck && hasContent;
}

async function checkTelegramAccess() {
  for (const pair of channelPairs) {
    try {
      const chat = await telegramBot.getChat(pair.TELEGRAM_CHAT_ID.toString());
      console.log(`✉️ Проверка доступа к Telegram ${pair.TELEGRAM_CHAT_ID}:`, {
        title: chat.title,
        type: chat.type,
        is_forum: chat.is_forum
      });

      if (pair.TELEGRAM_THREAD_ID) {
        try {
          const testMessage = await telegramBot.sendMessage(
            pair.TELEGRAM_CHAT_ID.toString(),
            '🔍 Проверка работы треда...',
            {
              message_thread_id: pair.TELEGRAM_THREAD_ID,
              disable_notification: true
            }
          );
          
          console.log(`✅ Тред ${pair.TELEGRAM_THREAD_ID} доступен`);
          await telegramBot.deleteMessage(
            pair.TELEGRAM_CHAT_ID.toString(), 
            testMessage.message_id
          );
          
        } catch (error) {
          console.error(`❌ Ошибка доступа к треду ${pair.TELEGRAM_THREAD_ID}:`, {
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    } catch (error) {
      console.error(`❌ Ошибка доступа к чату ${pair.TELEGRAM_CHAT_ID}:`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

discordClient.on('messageCreate', async (message) => {
  console.log(`📩 Получено сообщение в канале ${message.channel.id}:`, {
    content: message.content,
    author: message.author?.tag,
    attachments: message.attachments.size
  });

  if (shouldProcessMessage(message) && !messageStore.has(message.id)) {
    console.log(`🚀 Начало обработки сообщения ${message.id}`);
    await sendToTelegram(message);
  }
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
      const channel = await discordClient.channels.fetch(pair.DISCORD_CHANNEL_ID) as TextChannel;
      
      if (!channel) {
        console.error(`❌ Канал ${pair.DISCORD_CHANNEL_ID} не найден`);
        continue;
      }

      const permissions = channel.permissionsFor(discordClient.user!.id);
      if (!permissions) {
        console.error(`🚫 Нет прав доступа к каналу ${channel.name}`);
        continue;
      }

      console.log(`🔐 Права для канала ${channel.name}:`, {
        ViewChannel: permissions.has(PermissionsBitField.Flags.ViewChannel),
        ReadMessageHistory: permissions.has(PermissionsBitField.Flags.ReadMessageHistory),
        SendMessages: permissions.has(PermissionsBitField.Flags.SendMessages),
        ManageWebhooks: permissions.has(PermissionsBitField.Flags.ManageWebhooks),
        AttachFiles: permissions.has(PermissionsBitField.Flags.AttachFiles),
        EmbedLinks: permissions.has(PermissionsBitField.Flags.EmbedLinks)
      });

      try {
        const testMessage = await channel.messages.fetch({ limit: 1 });
        console.log(`✅ Успешное чтение сообщений в ${channel.name}`);
      } catch (error) {
        console.error(`❌ Ошибка чтения сообщений в ${channel.name}:`, error);
      }

      checkTelegramAccess()
      
    } catch (error:any) {
      console.error('🔴 Ошибка доступа:', {
        channelId: pair.DISCORD_CHANNEL_ID,
        error: error.message
      });
    }
  }
  
  sendLastMessages(1);
});

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
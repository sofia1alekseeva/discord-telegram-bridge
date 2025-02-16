import { Client, GatewayIntentBits, Message, PartialMessage } from 'discord.js';
import TelegramBot, { InputMedia } from 'node-telegram-bot-api';
import * as dotenv from 'dotenv';

dotenv.config();

// Проверка переменных окружения
const requiredEnvVars = [
    'DISCORD_TOKEN',
    'DISCORD_CHANNEL_ID',
    'TELEGRAM_TOKEN',
    'TELEGRAM_CHAT_ID',
];

requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`Missing environment variable: ${varName}`);
        process.exit(1);
    }
});


interface TelegramMessageData {
    messageId: number;
    mediaIds: string[];
  }
  
  const messageStore = new Map<string, TelegramMessageData>();
  
  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });
  
  const telegramBot = new TelegramBot(process.env.TELEGRAM_TOKEN!);
  
  // Отправка сообщения с медиа
  async function sendToTelegram(message: Message): Promise<void> {
    try {
      const text = `*${message.author.displayName}* (Discord):\n${message.content}`;
      const media = Array.from(message.attachments.values());
      
      let telegramMessageId: number;
      const mediaIds: string[] = [];
  
      if (media.length > 0) {
        // Отправка медиа с подписью
        const mediaGroup: InputMedia[] = media.map((a, i) => ({
          type: 'photo',
          media: a.url,
          caption: i === 0 ? text : undefined,
          parse_mode: 'Markdown'
        }));
  
        const sentMedia = await telegramBot.sendMediaGroup(
          process.env.TELEGRAM_CHAT_ID!,
          mediaGroup,
          { // @ts-ignore
            message_thread_id: Number(process.env.TELEGRAM_THREAD_ID) || 1
           }
        );
        
        telegramMessageId = sentMedia[0].message_id;
        mediaIds.push(...sentMedia.map(m => m.message_id.toString()));
      } else {
        // Отправка текста
        const sentMessage = await telegramBot.sendMessage(
          process.env.TELEGRAM_CHAT_ID!,
          text,
          { parse_mode: 'Markdown',
            message_thread_id: Number(process.env.TELEGRAM_THREAD_ID) || 1
           }
        );
        telegramMessageId = sentMessage.message_id;
      }
  
      messageStore.set(message.id, {
        messageId: telegramMessageId,
        mediaIds
      });
  
    } catch (error) {
      console.error('Ошибка отправки:', error);
    }
  }
  
  // Редактирование сообщения с медиа
  async function editInTelegram(message: Message | PartialMessage): Promise<void> {
    try {
      const data = messageStore.get(message.id);
      if (!data) return;
  
      // Удаляем старые медиа
      await deleteFromTelegram(message.id);
      
      // Отправляем новые
      await sendToTelegram(message as Message);
  
    } catch (error) {
      console.error('Ошибка редактирования:', error);
    }
  }
  
  // Удаление сообщения и медиа
  async function deleteFromTelegram(messageId: string): Promise<void> {
    try {
      const data = messageStore.get(messageId);
      if (!data) return;
  
      // Удаляем все связанные сообщения
      await Promise.all([
        telegramBot.deleteMessage(process.env.TELEGRAM_CHAT_ID!, data.messageId),
        ...data.mediaIds.map(id => 
          telegramBot.deleteMessage(process.env.TELEGRAM_CHAT_ID!, parseInt(id)).catch(() => null)
        )
      ]);
      
      messageStore.delete(messageId);
    } catch (error) {
      console.error('Ошибка удаления:', error);
    }
  }
  
  // Проверка типа медиа
  // function isImage(attachment: Attachment): boolean {
  //   const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  //   return imageTypes.includes(attachment.contentType || '');
  // }
  
  // Обработчики событий
  discordClient.on('messageCreate', async (message) => {
    if (shouldProcessMessage(message)) {
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
  
  function shouldProcessMessage(message: Message | PartialMessage): boolean {
    return !!(
      message.channel.id === process.env.DISCORD_CHANNEL_ID &&
      !message.author?.bot &&
      (message.content || message.attachments.size > 0)
    );
  }
  
  discordClient.login(process.env.DISCORD_TOKEN!);

// Запуск бота
discordClient.login(process.env.DISCORD_TOKEN!)
    .then(async () => {
        console.log('Discord bot connected');
        const updates = await telegramBot.getUpdates()
        console.log("updates", JSON.stringify(updates, null, 4))
        console.log('Initial history sent');
    })
    .catch(error => console.error('Discord login error:', error));

// Обработка ошибок
// shadowsocksAgent.on('error', error => console.error('Proxy error:', error));
discordClient.on('error', error => console.error('Discord error:', error));
telegramBot.on('error', error => console.error('Telegram error:', error));

// Элегантное завершение
process.on('SIGINT', () => {
    discordClient.destroy();
    console.log('Bot stopped');
    process.exit();
});
import { Client, GatewayIntentBits, TextChannel, Attachment, ClientOptions } from 'discord.js';
import TelegramBot from 'node-telegram-bot-api';
import { SocksProxyAgent  } from 'socks-proxy-agent';
import * as dotenv from 'dotenv';

dotenv.config();

// Проверка переменных окружения
const requiredEnvVars = [
    'DISCORD_TOKEN',
    'DISCORD_CHANNEL_ID',
    'TELEGRAM_TOKEN',
    'TELEGRAM_CHAT_ID',
    'WITH_SHADOWSOCKS',
    'SHADOWSOCKS_HOST',
    'SHADOWSOCKS_PORT',
    'SHADOWSOCKS_USER',
    'SHADOWSOCKS_PASSWORD'
];

requiredEnvVars.forEach(varName => {
    if (!process.env[varName]) {
        console.error(`Missing environment variable: ${varName}`);
        process.exit(1);
    }
});

let discordOptions: ClientOptions = {
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
}


// Инициализация клиентов
const discordClient = new Client(discordOptions);

const telegramBot = new TelegramBot(process.env.TELEGRAM_TOKEN!);

// Функция отправки в Telegram (изменён тип параметра)
async function sendToTelegram(message: string, attachments: Attachment[] = []) {
    try {
        const sentMessage = await telegramBot.sendMessage(
            process.env.TELEGRAM_CHAT_ID!,
            message,
            { parse_mode: 'Markdown' }
        );

        for (const attachment of attachments) {
            if (isImage(attachment)) {
                await telegramBot.sendPhoto(
                    process.env.TELEGRAM_CHAT_ID!,
                    attachment.url,
                    { reply_to_message_id: sentMessage.message_id }
                );
            } else {
                await telegramBot.sendDocument(
                    process.env.TELEGRAM_CHAT_ID!,
                    attachment.url,
                    { reply_to_message_id: sentMessage.message_id }
                ); 
            }
        }
    } catch (error) {
        console.error('Telegram send error:', error);
    }
}

// Проверка типа вложения (обновлён тип)
function isImage(attachment: Attachment): boolean {
    const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const extension = attachment.url.split('.').pop()?.toLowerCase();
    return !!extension && imageExtensions.includes(extension);
}

// Обработчик новых сообщений
discordClient.on('messageCreate', async message => {
    if (message.channel.id !== process.env.DISCORD_CHANNEL_ID || message.author.bot) return;

    const messageText = `*${message.author.username}* (Discord):\n${message.content}`;
    const attachments = Array.from(message.attachments.values());

    await sendToTelegram(messageText, attachments);
    console.log(`Forwarded message from ${message.author.username}`);
});

// Функция отправки истории сообщений
async function sendLastMessages(limit:number) {
    try {
        const channel = await discordClient.channels.fetch(process.env.DISCORD_CHANNEL_ID!);

        if (!(channel instanceof TextChannel)) {
            throw new Error('Invalid text channel');
        }

        const messages = await channel.messages.fetch({ limit: limit });
        const messagesArray = Array.from(messages.values()).reverse();

        for (const message of messagesArray) {
            if (message.author.bot) continue;

            const messageText = `*${message.author.username}* (Discord):\n${message.content}`;
            const attachments = Array.from(message.attachments.values());

            await sendToTelegram(messageText, attachments);
            await new Promise(resolve => setTimeout(resolve, 500)); // Задержка между сообщениями
        }
    } catch (error) {
        console.error('History send error:', error);
    }
}

// Запуск бота
discordClient.login(process.env.DISCORD_TOKEN!)
    .then(async () => {
        console.log('Discord bot connected');
        await sendLastMessages(5);
        const updates = await telegramBot.getUpdates()
        // console.log("updates", JSON.stringify(updates, null, 4))
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
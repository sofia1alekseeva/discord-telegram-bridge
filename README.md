# Discord ↔ Telegram Bridge Bot (Multi-Channel Version)


Advanced bot for bidirectional message synchronization between Discord and Telegram with multi-channel support and topic management.

## 🌟 Features
- 🚀 **Parallel processing** of up to 100 channels
- 🧵 Native **Telegram Topic** support
- 🔄 Automatic edit/delete mirroring
- 📦 Full media support (images, videos, documents)
- ⏳ Message history playback
- 📊 Detailed operation logging

## 🛠 Technologies
| Component       | Version    | Purpose                     |
|-----------------|-----------|--------------------------------|
| Discord.js      | v14       | Discord integration          |
| node-telegram-bot-api | 0.61.0 | Telegram Bot API      |
| TypeScript      | 5.0       | Static typing         |
| YAML            | 2.3.4     | Channel configuration          |

## 📦 Installation

### Requirements
- Node.js 18.x+
- npm 9.x+
- Access to:
  - [Discord Developer Portal](https://discord.com/developers/applications)
  - [@BotFather](https://t.me/BotFather)

```bash
git clone https://github.com/sofia1alekseeva/LastFortressTelegramBot.git
cd LastFortressTelegramBot
npm install
```

## ⚙️ Configuration

1. Create `env.yaml`:
```yaml
DISCORD_TOKEN: "your_discord_token"
TELEGRAM_TOKEN: "your_telegram_token"
CHANNEL_PAIRS:
  - DISCORD_CHANNEL_ID: "123"          # Required
    TELEGRAM_CHAT_ID: -100456         # Required
    TELEGRAM_THREAD_ID: 789           # Optional
```

2. Build the project:
```bash
npm run build
```

3. Start the bot:
```bash
npm start
```

## 🎮 Usage

### Basic Workflow
1. **Send message** in Discord channel:
   ```discord
   [User] Hello from Discord! 🚀
   [Attached image.png]
   ```

2. **Result in Telegram**:
   ```
   User (Discord):
   Hello from Discord! 🚀
   [image.png]
   ```

### Advanced Features
- **Message Editing**:
  - Edit in Discord → auto-update in Telegram
  ```discord
  [User] [Original message] → [Edited message]
  ```

- **Message Deletion**:
  - Delete in Discord → delete in Telegram
  ```discord
  [Message deleted]
  ```

## 🚨 Troubleshooting

### Common Issues
| Symptom                | Solution                          |
|------------------------|----------------------------------|
| Messages not sending | 1. Check bot permissions<br>2. Verify channel IDs |
| Media not delivered | 1. Check file size (<20MB)<br>2. Verify format support |
| Connection errors     | 1. Check tokens<br>2. Update dependencies |


## 🌍 Configuration Examples

### Topic Synchronization
```yaml
CHANNEL_PAIRS:
  - DISCORD_CHANNEL_ID: "34543534535"
    TELEGRAM_CHAT_ID: -100123456
    TELEGRAM_THREAD_ID: 1
```

### Multi-Channel Setup
```yaml
CHANNEL_PAIRS:
  - DISCORD_CHANNEL_ID: "123234234353"
    TELEGRAM_CHAT_ID: -100112233
    TELEGRAM_THREAD_ID: 2
  
  - DISCORD_CHANNEL_ID: "345345345345"
    TELEGRAM_CHAT_ID: -100778899
```

## 📄 License
MIT License © 2025 [Sofia Alekseeva]
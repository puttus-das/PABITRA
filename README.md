<div align="center">

# 𝐏ᴀʙɪᴛʀᴀ-𝐁ᴏᴛ

[![Baileys](https://img.shields.io/badge/Made%20with-Baileys-00bcd4?style=for-the-badge)](https://github.com/WhiskeySockets/Baileys)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

<img src="utils/bot_image.jpg" alt="PABITRA-BOT" width="260">

**WhatsApp MD Bot with Telegram Pairing System**

*Fast • Customizable • Multi-Session*

</div>

---

## ✨ About

PABITRA-BOT is a customizable WhatsApp MD bot built with the Baileys library. It includes a modular command system, WhatsApp pairing through Telegram, session management, media tools, and utility commands.

## 🚀 Features

- WhatsApp pairing using a pairing code
- Telegram bot integration
- Multi-session support
- Modular commands in `commands/`
- Custom prefix and bot configuration
- Owner and group management commands
- Media and utility tools
- Automatic session loading and reconnection
- Termux and compatible hosting support

---

## 📥 Installation

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd YOUR_REPOSITORY_FOLDER
```

Replace the placeholders with your actual GitHub repository URL and folder name.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure the bot

Open `config.js` and check the owner number, bot name, prefix, and other settings.

Never upload your private session files, Telegram token, or API keys to a public repository.

---

## 🤖 Telegram Pairing System

The bot uses Telegram to request WhatsApp pairing codes.

### 1. Create a Telegram bot

1. Open Telegram.
2. Search for `@BotFather`.
3. Create a bot using `/newbot`.
4. Copy the token and keep it private.

### 2. Configure the Telegram token

Set the token as an environment variable:

```bash
export TELEGRAM_BOT_TOKEN='YOUR_TELEGRAM_BOT_TOKEN'
```

Replace the placeholder locally with your actual token. Do not share the token or commit it to GitHub.

For persistent hosting, configure `TELEGRAM_BOT_TOKEN` in your hosting platform's environment variables.

### 3. Configure pairing permissions

The bot supports `TELEGRAM_ADMIN_IDS` to restrict pairing and session management.

Set it to your authorized Telegram numeric user ID:

```bash
export TELEGRAM_ADMIN_IDS='YOUR_TELEGRAM_USER_ID'
```

Keep the authorized ID private where appropriate. If this variable is empty, the current code does not restrict these commands by Telegram user ID.

### 4. Start the bot

```bash
node index.js
```

Make sure the terminal shows that the Telegram pairing control plane has started.

### 5. Request a pairing code

Open the Telegram group where you want to use the pairing bot and send:

```text
/pair 91XXXXXXXXXX
```

Replace the example number with the WhatsApp number you want to connect, including its country code and without a leading zero.

For an Indian number, use `91` followed by the number.

### 6. Link WhatsApp

On the WhatsApp account you want to connect:

1. Open WhatsApp.
2. Go to **Settings → Linked Devices**.
3. Select **Link a Device**.
4. Choose the option to link with a phone number, if available.
5. Enter the pairing code received through Telegram.

Complete the process promptly because the code expires if the session is not connected in time.

---

## 🧰 Telegram Commands

| Command | Description |
|---|---|
| `/start` | Show pairing instructions |
| `/pair NUMBER` | Request a WhatsApp pairing code |
| `/unpair NUMBER` | Remove a session |
| `/sessions` | View active sessions |
| `/status` | Check bot status |
| `/ping` | Check bot response time |

Pairing commands are designed for Telegram groups. Configure authorized Telegram IDs before allowing others to use the pairing system.

---

## 📱 Termux Setup

Install the required packages:

```bash
pkg update
pkg install nodejs git
```

Go to your project directory:

```bash
cd ~/PABITRA-BOT/Rahi-main
```

Install dependencies and start the bot:

```bash
npm install
node index.js
```

Set the Telegram environment variables in your local Termux session before starting the bot if you use Telegram pairing.

---

## 📂 Project Structure

```text
Rahi-main/
├── assets/
├── commands/
├── database/
│   └── sessions/
├── utils/
├── autoload.js
├── bot.js
├── config.js
├── database.js
├── handler.js
├── index.js
├── package.json
└── pair.js
```

The project uses `handler.js` for message handling and `pair.js` for WhatsApp pairing and session management.

---

## 🌐 Community

[![Telegram](https://img.shields.io/badge/Telegram-PABITRA--BOTZ-0088cc?style=for-the-badge&logo=telegram)](https://t.me/PABITRA_BOTZ)

[![WhatsApp Channel](https://img.shields.io/badge/WhatsApp-Channel-25D366?style=for-the-badge&logo=whatsapp)](https://whatsapp.com/channel/0029Vb8RL4F1HspsNlYYOE3e)

---

## 🙏 Credits

- PABITRA-BOT — Custom bot branding and modifications
- Baileys — WhatsApp Web API library
- Original project authors and open-source contributors

Retain the original project's applicable copyright and license notices.

---

## ⚠️ Disclaimer

- This is an unofficial third-party WhatsApp bot.
- Use the bot responsibly and follow applicable terms and laws.
- Do not use it for spam, harassment, or unsolicited bulk messaging.
- Third-party automation may result in account restrictions.
- Protect your WhatsApp session credentials and Telegram bot token.

## 📄 License

Refer to the repository's `LICENSE` file for the applicable license. Preserve the original authors' copyright and license notices when redistributing modified code.

---

<div align="center">

**© PABITRA-BOT**

*Made with ❤️*

</div>

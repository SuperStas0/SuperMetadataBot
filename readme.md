# Super Metadata
Telegram bot to download audio from YouTube and edit its metadata.

Public instance: [@supermetadatabot](https://t.me/supermetadatabot). Hosting your own is recommended.

# Quick Start
## Requirements
- Telegram account
- Node.js

## Build
1. Clone: `git clone https://github.com/SuperStas0/SuperMetadata.git`
2. Run `build.bat` (installs dependencies)

Flags are combinable, e.g. `build.bat -cr`:
- `-c` clean: delete `node_modules` first
- `-r` release: package the build into `release\`
- `-h` show help

## Launch
### First-time setup
1. Create a bot with [@BotFather](https://t.me/BotFather) and copy its API key
2. Run `node setup.js`, enter the bot's API key and the needed fields **for your account**
3. When asked for the 2FA code, you will receive it from Telegram

### Start
1. Run `node main.js`
2. Send `/start` to the bot

# Usage
Load audio into the bot by any of:
- Built-in YouTube search
- YouTube video link
- Existing audio in Telegram

Then you can:
- Trim
- Change title
- Change performer
- Change poster
- Change duration

# License
MIT

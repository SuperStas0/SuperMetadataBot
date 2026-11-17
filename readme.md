# Super Metadata

Telegram bot to download audio from YouTube and edit its metadata.

# Installation
1. Install Node.js 22 or newer.
2. Clone the repository: `git clone https://github.com/SuperStas0/SuperMetadata.git`
3. Run `build.bat` (installs dependencies).
4. Create a bot with [@BotFather](https://t.me/BotFather) and copy its API key.
5. Run `node setup.js`, enter the bot's API key and the needed fields for your account.
6. When asked for the 2FA code, enter the one you receive from Telegram.

# Usage
Public instance: [@supermetadatabot](https://t.me/supermetadatabot). Hosting your own is recommended.

1. Run `node main.js`.
2. Send `/start` to the bot.

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

# Cookies
Some videos need a YouTube login: age restricted ones, and any video when YouTube blocks the server as a bot. Cookies are used only for such videos and only the cookies of the user who sent the request.

1. Export your YouTube cookies in Netscape format as `cookies.txt`.
2. Send the file to the bot. Only YouTube and Google cookies are kept.
3. Send `/removecookies` to delete them.

# Building
Requirements:
- Node.js 22 or newer

Run `build.bat [-c] [-r] [-h]`. Flags combine in any order, e.g. `build.bat -cr`.

| Flag | Action |
| --- | --- |
| `-c` | Clean: delete previous build output first |
| `-r` | Release: package the build into `release\Metadata.zip` (`main.js`, `src`, `static` without `config.json`, `package.json`, `package-lock.json`, `readme.md`, `LICENSE.md`) |
| `-h` | Show this help |

Build output: `node_modules`

# License
- [MIT](LICENSE.md)

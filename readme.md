# Super Metadata

Telegram bot to download audio from YouTube and edit its metadata.

# Installation
1. Clone the repository: `git clone https://github.com/SuperStas0/SuperMetadata.git`
2. Run `build.bat` (Windows) or `bash build.sh` (Linux, macOS). It installs Node.js 22 or newer if missing, installs the dependencies and starts the setup.
3. Follow the setup instructions: create the bot with [@BotFather](https://t.me/BotFather), get an api_id and api_hash on [my.telegram.org](https://my.telegram.org), log in your Telegram account. The account becomes the bot admin.

The settings are saved to `static\config.json`. The admin sets who can use the bot in the Settings of the admin panel (`/admin`): public, confirmation of each new user, or private. The bot is private by default, the state is saved to `static\settings.json`. Run the build with `-s` to set them up again.

# Usage
Public instance: [@supermetadatabot](https://t.me/supermetadatabot). Hosting your own is recommended.

1. Run `node start.js`.
2. Send `/start` to the bot.

Load audio into the bot by any of:
- Built-in YouTube search: `/search query` or any text message, first 5 results sorted by views
- YouTube video link
- YouTube playlist link (asks for confirmation first)
- Audio or music files sent to the bot, up to 20 MB each, several at once load as a batch

Then you can:
- Cut out parts of the audio, with suggestions from SponsorBlock and silence detection
- Change title, in a batch one after another from the first audio to the last
- Change the order of a batch
- Change performer
- Change poster
- Format the poster: remove black edges, crop to 1:1 and resize to the Telegram poster size
- Change duration

Errors are written to `logs\error.log`. The admin can view the last one in the admin panel (`/admin`).

# Cookies
Some videos need a YouTube login: age restricted ones, and any video when YouTube blocks the server as a bot. Cookies are used only for such videos and only the cookies of the user who sent the request.

1. Export your YouTube cookies in Netscape format as `cookies.txt`. Open a private window, sign in to a secondary account, open `https://www.youtube.com/robots.txt` in the same tab, export the `youtube.com` cookies, then close the window.
2. Send the file to the bot. Only YouTube and Google cookies are kept.
3. Send `/removecookies` to delete them.

The admin can let users without cookies use the admin cookies, always or after a confirmation, in the Settings of the admin panel (`/admin`). It is off by default, the state is saved to `static\settings.json`.

# Building
Requirements:
- Node.js 22 or newer (installed automatically if missing)

Run `build.bat [-c] [-s] [-r] [-h]`. Flags combine in any order, e.g. `build.bat -cr`.

| Flag | Action |
| --- | --- |
| `-c` | Clean: delete previous build output first |
| `-s` | Setup: ask for the bot token and Telegram account, save `static\config.json` |
| `-r` | Release: package the build into `release\Metadata.zip` (`main.js`, `start.js`, `build.bat`, `build.sh`, `src`, `static` without `config.json`, its backup and `settings.json`, `package.json`, `package-lock.json`, `readme.md`, `LICENSE.md`) |
| `-h` | Show this help |

Setup also runs when `static\config.json` is missing, unless `-r` is given. `build.sh` (Linux, macOS) accepts `-c`, `-s` and `-h` with the same meaning.

Build output: `node_modules`

# License
- [MIT](LICENSE.md)

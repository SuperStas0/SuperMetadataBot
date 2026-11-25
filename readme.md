# Super Metadata

Telegram bot to download audio from YouTube and edit its metadata.

# Installation
1. Clone the repository: `git clone https://github.com/SuperStas0/SuperMetadata.git`
2. Run `build.bat` (Windows) or `bash build.sh` (Linux, macOS). It installs Node.js 22 or newer if missing, installs the dependencies and starts the setup.
3. Follow the setup instructions: create the bot with [@BotFather](https://t.me/BotFather), get an api_id and api_hash on [my.telegram.org](https://my.telegram.org), log in your Telegram account. The account becomes the bot admin.

The settings are saved to `static\config.json`. The admin sets who can use the bot in the Settings of the admin panel (`/admin`): public, confirmation of each new user, or private. The bot is private by default, the state is saved to `static\settings.json`. With confirmation, the message that asked for access (a link, a search, a file) runs after the admin allows it. Run the build with `-s` to set them up again.

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
- Change poster: send a photo, a YouTube link, or a text to search YouTube and take the thumbnail of the first result, audio files keep their embedded cover or Telegram thumbnail
- Format the poster: remove black edges equally from both sides, cut a square from the center, scaled down to 320x320 at most, smaller images are not enlarged or padded, every new poster is formatted by default and Unformat restores the original
- Unbatch: set performer and poster for one audio of a batch instead of the whole batch
- Change duration

Errors are written to `logs\error.log`. The admin can view the last one in the admin panel (`/admin`).

In Delete audio of the admin panel (`/admin`) the admin can delete the audio of their last load, or any stored YouTube or uploaded audio from a list. While a list is open, a text message filters it by title or performer instead of searching YouTube, Clear filter shows the whole list again. A deleted audio is downloaded again when someone loads it.

In the Settings of the admin panel (`/admin`) the admin picks the cache size, a preset for how much and for how long audio is stored. The oldest audio is deleted first. The age counts from the last use. Changing the preset cleans the cache right away. The state is saved to `static\settings.json`.

| Preset | Size limit | Audio and user posters kept | Info of deleted audio kept | Cleanup |
| --- | --- | --- | --- | --- |
| scarce | 2 GB | 1 day | 7 days | every hour |
| default | 5 GB | 7 days | 30 days | every 24 hours |
| ultimate | 50 GB | 30 days | 180 days | every 24 hours |
| disabled | none | forever | forever | every 24 hours |

In every preset, when the free disk space drops below 1 GB, the oldest audio is deleted until it is free again.

# Cookies
Some videos need a YouTube login: age restricted ones, and any video when YouTube blocks the server as a bot. Cookies are used only for such videos and only the cookies of the user who sent the request.

1. Export your YouTube cookies in Netscape format as a `.txt` file, the name does not matter. Open a private window, sign in to a secondary account, open `https://www.youtube.com/robots.txt` in the same tab, export the `youtube.com` cookies, then close the window.
2. Send the file to the bot. Only YouTube and Google cookies are kept. The bot checks them with YouTube and saves them only if they work.
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

# Credit
- [MIT](LICENSE.md)

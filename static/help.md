Loading audio
Send a YouTube link and the bot loads its audio as m4a.
Send several links in one message to load them as a batch, up to 10 at once.
Live streams and videos longer than 4 hours are not supported.
Audio is limited to 50 MB, the Telegram bot upload limit. Quality is lowered to fit, videos that still do not fit are declined.
Loaded audio is cached on the server, repeated links load faster.

Menu
Title - send the new title, up to 256 characters
Performer - send the new performer, up to 256 characters. Set default restores the YouTube channel name, Remove clears it
Start and End - trim the audio, send the timecode as seconds, MM:SS or HH:MM:SS. Start must be before End and both must be inside the duration. Set default removes the limit
Poster - send a photo to use as the poster. Set default restores the YouTube thumbnail, Remove clears it
Send - send the edited audio
Cancel - go back to the main menu
Delete - admin only, deletes the loaded audio from the server and loads it again
The messages you send to change a value are deleted after they are applied.

Batch
Previous and Next switch between the loaded audios, each one is edited separately.
Send All sends every audio of the batch.
Start, End and Delete are not available for a batch.

Commands
/start - basic information
/help - this text
/cookies - cookies information and current status
/removecookies - delete your saved cookies

Cookies
YouTube asks for a login on age restricted videos and when it blocks the server as a bot.
Send your YouTube cookies as a cookies.txt file in Netscape format. Only YouTube and Google cookies are kept, and they are used only for your own requests, only when a video needs them.
The file gives access to your account, use a secondary account.

Notes
The bot only works in DMs.
Wait for a request to finish before sending the next one.

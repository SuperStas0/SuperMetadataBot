*Loading audio*
Send a YouTube link and the bot loads its audio as m4a.
Send several links in one message to load them as a batch, up to 10 at once.
Send a YouTube playlist link to load all its videos as a batch. The bot shows the video count and asks for confirmation first, a long playlist may take a long time to load. The same batch limit applies.
Live streams and videos longer than 4 hours are not supported.
Audio is limited to 50 MB, the Telegram bot upload limit. Quality is lowered to fit, videos that still do not fit are declined.
Loaded audio is cached on the server, repeated links load faster.

*Menu*
*Title* - send the new title, up to 256 characters
*Performer* - send the new performer, up to 256 characters. _Set default_ restores the YouTube channel name, _Remove_ clears it
*Start* and *End* - trim the audio, send the timecode as `seconds`, `MM:SS` or `HH:MM:SS`. Start must be before End and both must be inside the duration. _Set default_ removes the limit
*Poster* - send a photo to use as the poster. _Set default_ restores the YouTube thumbnail, _Remove_ clears it, _Make square_ crops it from the middle to 1:1 and _Make original_ undoes that
*Send* - send the edited audio
*Cancel* - go back to the main menu
*Delete* - admin only, deletes the loaded audio from the server and loads it again
The messages you send to change a value are deleted after they are applied.

*Batch*
*Previous* and *Next* switch between the loaded audios, each one is edited separately.
*Send All* sends every audio of the batch.
*Start*, *End* and *Delete* are not available for a batch.

*Commands*
/start - basic information
/help - this text
/cookies - how to send cookies and their current status
/removecookies - delete your saved cookies

*Cookies*
YouTube asks for a login on age restricted videos and when it blocks the server as a bot. Use /cookies for the export steps.

*Notes*
The bot only works in DMs.
Wait for a request to finish before sending the next one.

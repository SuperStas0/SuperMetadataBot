*Loading audio*
Send a YouTube link and the bot loads its audio as m4a.
Send several links in one message to load them as a batch, up to 10 at once.
Send a YouTube playlist link to load all its videos as a batch. The bot shows the video count and asks for confirmation first, a long playlist may take a long time to load. The same batch limit applies.
Send `/search query` to search YouTube. Any other text message searches too, if the admin turned the confirmation on the bot asks to confirm it with a Yes button first and any other action removes that question. The bot shows the first 5 results sorted by views, with the channel, views and duration. Press the number of a result to load it.
Send an audio or a music file to the bot to edit your own file, up to 20 MB, the Telegram bot download limit. Send several files at once, or as an album, to load them as a batch, up to 10 at once, the batch rules below apply. Any format ffmpeg reads works, the result is m4a. Files other than m4a are converted to AAC at the bitrate of the file, 192 kbit/s at most. The title and performer are taken from the file, the poster from its embedded cover or, if it has none, from its Telegram thumbnail.
Live streams and videos longer than 4 hours are not supported.
Audio is limited to 50 MB, the Telegram bot upload limit. Quality is lowered to fit, videos that still do not fit are declined. The admin can allow larger audio for users, with or without a confirmation.
Loaded audio is cached on the server, repeated links load faster.
The bot shows the progress of downloads, conversions and uploads where possible. Send /cancel to drop a request that is running.

*Menu*
*Title* - send the new title, up to 256 characters
*Performer* - send the new performer, up to 256 characters. _Set default_ restores the YouTube channel name, _Remove_ clears it
*Cuts* - cut out parts of the audio, in the middle too. The Cuts menu is a reply to the loaded audio, tap a timecode in it to jump there. Send a range as `start - end`, for example `1:30 - 2:45`, one range per line, timecodes as `seconds`, `MM:SS` or `HH:MM:SS`, durations of an hour or more are shown as `H:MM:SS`. Leave a side empty for the edge of the audio, `1:30 -` cuts to the end and `- 2:45` from the start, `start` and `end` work too. A time after the end snaps to the end. Up to 10 cuts, overlapping ones are merged. _Remove 1_, _Remove 2_ and so on delete a single cut, _Clear all_ deletes all of them
*Suggestions* - the Cuts menu lists sponsor, self promotion, intro, outro and similar segments from SponsorBlock, and silent parts of the audio (below -60 dB for 2 seconds or more, found in the background after the audio is loaded), up to 8 in total. _Apply 1_, _Apply 2_ and so on add one, _Apply all_ adds all of them. The video id is sent to sponsor.ajay.app when a YouTube audio is loaded. The main message shows a bold line while there are suggestions that are not applied yet
*Poster* - send a photo, a YouTube link to use the thumbnail of that video, or a text to search YouTube and use the thumbnail of the first result, as the poster. The search confirmation applies as for any search. _Set youtube_ restores the YouTube thumbnail (_Set original_ for audio files), _Remove_ clears it, _Format_ removes the black edges, the same size from both sides, and cuts a square from the center, scaled down to 320x320 at most, the Telegram poster size, smaller images are not enlarged or padded, _Unformat_ undoes that. Every new poster is formatted by default
*Send* - send the edited audio
*Back* - go back to the main menu. In the search results and the playlist confirmation *Cancel* closes the message
The messages you send to change a value are deleted after they are applied.

*Batch*
*Previous* and *Next* switch between the loaded audios. *Title* and *Cuts* are set separately for each audio, *Performer* and *Poster* are shared and apply to the whole batch. *Unbatch* makes them apply to the current audio only and the button becomes *Batch*, which shares them again. A batch is shared by default.
A batch that has one audio left, for example when the other links failed to load, opens as a single audio.
*Send All* sends every audio of the batch in its current order.
*Titles* shows the title of every audio one after another, from the first to the last: send the new title and the next audio comes up at once, _Skip_ keeps the title, _Back_ stops.
*Order* - _Previous_ and _Next_ select an audio, _Move up_, _Move down_, _To first_ and _To last_ move it. Or send two numbers like `5 2` to put audio 5 on position 2, one move per line.

*Commands*
/start - basic information
/search - search YouTube, for example `/search Never gonna give you up`
/help - this text
/cookies - how to send cookies and their current status
/removecookies - delete your saved cookies
/cancel - drop the current action
/admin - admin only, admin panel

*Cookies*
YouTube asks for a login on age restricted videos and when it blocks the server as a bot. Use /cookies for the export steps. If the bot admin shares their cookies, they are used for you when you have none, the admin may have to confirm it each time.

*Notes*
The bot only works in DMs.
Wait for a request to finish before sending the next one, or send /cancel.

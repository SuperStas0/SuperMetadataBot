*Loading audio*
Send a YouTube link and the bot loads its audio as m4a. Several links in one message load as a batch, up to 10 at once.
Send a YouTube playlist link to load all its videos as a batch, the bot asks for confirmation first.
Send `/search query` or any other text to search YouTube, the admin may turn on a confirmation with a Yes button. The bot shows the first 5 results sorted by views, press a number to load one.
Send an audio or a music file to edit it, up to 20 MB. Several files or an album load as a batch. Any format ffmpeg reads works, the result is m4a. Files other than m4a are converted to AAC at the bitrate of the file, 192 kbit/s at most. The title and performer are taken from the file, the poster from its embedded cover or, if it has none, from its Telegram thumbnail.
Live streams and videos longer than 4 hours are not supported.
Audio is limited to 50 MB, quality is lowered to fit, videos that still do not fit are declined. The admin can allow larger audio.
The bot shows progress where possible, the Cancel button under the progress message drops a running request.

*Menu*
*Title* - send the new title, up to 256 characters
*Performer* - send the new performer, up to 256 characters. _Set default_ restores the YouTube channel name, _Remove_ clears it
*Cuts* - cut out parts of the audio, in the middle too. Send a range as `start - end`, for example `1:30 - 2:45`, one range per line, timecodes as `seconds`, `MM:SS` or `HH:MM:SS`. Leave a side empty for the edge of the audio: `1:30 -` cuts to the end, `- 2:45` from the start. Up to 10 cuts, overlapping ones are merged. The Cuts menu is a reply to the loaded audio, tap a timecode in it to jump there. _Remove 1_ deletes a single cut, _Clear all_ all of them
*Suggestions* - the Cuts menu lists sponsor, self promotion, intro, outro and similar segments from SponsorBlock, and silent parts of the audio (below -60 dB for 2 seconds or more), up to 8 in total. _Apply 1_ adds one, _Apply all_ adds all of them. The video id is sent to sponsor.ajay.app when a YouTube audio is loaded.
*Poster* - send a photo, a YouTube link, or a text to search YouTube, the thumbnail of that video or of the first result becomes the poster. _Set original_ restores the original thumbnail, the YouTube one or the one of the audio file, it is shown only when the audio has one, _Remove_ clears it. New posters are formatted by default: black edges are removed equally from both sides and a square is cut from the center, 320x320 at most, smaller images are not enlarged or padded. _Unformat_ and _Format_ switch it
*Send* - send the edited audio
*Back* - go back to the main menu, *Cancel* closes the search results, the search confirmation and the playlist confirmation
The messages you send to change a value are deleted after they are applied.

*Batch*
*Previous* and *Next* switch between the loaded audios. *Title* and *Cuts* are set separately for each audio, *Performer* and *Poster* apply to the whole batch. *Unbatch* makes them apply to the current audio only, the button becomes *Batch* and shares them again.
A batch with one audio left, for example when the other links failed to load, opens as a single audio.
*Send All* sends every audio in the current order.
*Titles* shows every audio one after another: send the new title and the next audio comes up, _Skip_ keeps the title, _Back_ stops.
*Order* - _Previous_ and _Next_ select an audio, _Move up_, _Move down_, _To first_ and _To last_ move it. Or send two numbers like `5 2` to put audio 5 on position 2, one move per line.

*Commands*
/start - basic information
/search - search YouTube, for example `/search Never gonna give you up`
/edit - set the performer and the title of the loaded audio at once, for example `/edit Rick Astley - Never Gonna Give You Up`. Only the first `-` splits them, `/edit Title` sets the title and clears the performer
/title - set the title of the loaded audio, for example `/title Never Gonna Give You Up`
/performer - set the performer of the loaded audio, for example `/performer Rick Astley`
/feedback - send a message to the developer, for example `/feedback can you fix this issue: ...`
/help - this text
/cookies - how to send cookies and their current status
/removecookies - delete your saved cookies
/admin - admin only, admin panel

*Cookies*
YouTube asks for a login on age restricted videos and when it blocks the server as a bot, see /cookies for the export steps. If the admin shares their cookies, they are used when you have none, the admin may have to confirm each time.

*Notes*
The bot only works in DMs.

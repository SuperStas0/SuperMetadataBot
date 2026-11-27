*Loading audio*
Send a YouTube link, a playlist link (the bot asks for confirmation first) or several links in one message, up to 10. Several links and playlists load as a batch.
Send `/search query` or any other text to search YouTube, the first 5 results sorted by views are shown, press a number to load one. The admin may turn on a Yes confirmation.
Send audio or music files, up to 20 MB each, several files or an album load as a batch. Any format ffmpeg reads works, the result is m4a (AAC at the bitrate of the file, 192 kbit/s at most). Title and performer come from the file, the poster from its cover or Telegram thumbnail.
Live streams and videos longer than 4 hours are not supported. Audio is limited to 50 MB, quality is lowered to fit, what still does not fit is declined. The admin can allow larger audio.
The Cancel button under the progress message drops a running request.

*Menu*
*Title* and *Performer* - send the new value, up to 256 characters. _Set default_ restores the YouTube channel name, _Remove_ clears the performer
*Cuts* - cut out parts of the audio, in the middle too. Send ranges as `start - end`, one per line, for example `1:30 - 2:45`, timecodes as `seconds`, `MM:SS` or `HH:MM:SS`. An empty side is the edge of the audio: `1:30 -` cuts to the end, `- 2:45` from the start. Up to 10 cuts, overlapping ones are merged. Tap a timecode in the menu to jump there. _Remove 1_ deletes one cut, _Clear all_ all of them
*Suggestions* - the Cuts menu lists SponsorBlock segments (sponsor, intro, outro and similar) and silent parts (below -60 dB for 2 seconds or more), up to 8. _Apply 1_ adds one, _Apply all_ all. The video id is sent to sponsor.ajay.app when a YouTube audio is loaded.
*Poster* - send a photo, a YouTube link or a text to search YouTube, the thumbnail of the video or of the first result becomes the poster. _Set original_ restores the original one and is shown only when the audio has one, _Remove_ clears it. New posters are formatted: black edges are removed equally from both sides and a square is cut from the center, 320x320 at most, smaller ones are not enlarged. _Unformat_ and _Format_ switch it
*Send* - send the edited audio
*Back* - go back to the main menu, *Cancel* closes the search results, the search confirmation and the playlist confirmation
Messages you send to change a value are deleted after they are applied.

*Batch*
*Previous* and *Next* switch between the loaded audios. *Title* and *Cuts* are set per audio, *Performer* and *Poster* apply to the whole batch. *Unbatch* limits them to the current audio, the button becomes *Batch* and shares them again.
A batch with one audio left, for example after failed links, opens as a single audio.
*Send All* sends every audio in the current order.
*Titles* shows every audio one after another: send the new title and the next one comes up, _Skip_ keeps the title, _Back_ stops.
*Order* - _Previous_ and _Next_ select an audio, _Move up_, _Move down_, _To first_ and _To last_ move it. Or send two numbers like `5 2` to put audio 5 on position 2, one move per line.

*Commands*
/start - basic information
/search - search YouTube, `/search Never gonna give you up`
/edit - set performer and title, `/edit Rick Astley - Never Gonna Give You Up`. Only the first `-` splits them, `/edit Title` clears the performer
/title - set the title, `/title Never Gonna Give You Up`
/performer - set the performer, `/performer Rick Astley`
/feedback - message the developer, `/feedback can you fix this issue: ...`, the reply comes in this chat
/help - this text
/cookies - how to send cookies and their status
/removecookies - delete your saved cookies
/admin - admin only, admin panel

*Cookies*
YouTube asks for a login on age restricted videos and when it blocks the server as a bot, see /cookies for the export steps. If the admin shares their cookies, they are used when you have none, the admin may have to confirm each time.

*Notes*
The bot only works in DMs.

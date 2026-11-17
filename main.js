import { Network } from "./src/network.js";
import { Files } from "./src/files.js";
import { User } from "./src/user.js";
import { Utility } from "./src/utility.js";
import { Audio } from "./src/audio.js";
import { Telegraf, Markup} from "telegraf";
import filters from "telegraf/filters";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export class App {
    static app = new Telegraf(Files.config.botToken, {handlerTimeout: Infinity});

    static userClient = new TelegramClient(new StringSession(Files.config.sessionId), Files.config.apiId, Files.config.apiHash, { connectionRetries: 5 });

    /** @type {Record<number, User>} */
    static data = {};

    static largeFiles = {};

    static cacheAge = 7 * 24 * 60 * 60 * 1000;

    static cacheFolderAge = 30 * 24 * 60 * 60 * 1000;

    static cacheSize = 5 * 1024 * 1024 * 1024;

    static clean(force) {
        try {
            if (!force && Object.values(this.data).some(user => user.status == "loading")) return;
            Files.cleanCache(this.cacheAge, this.cacheFolderAge, this.cacheSize);
        }
        catch (error) {
            console.log(error);
        }
    }

    static async start() {
        process.on("unhandledRejection", error => console.log(error));
        this.app.catch(error => console.log(error));

        if (!Network.ytdlp.ffmpegPath || !Files.exists(Network.ytdlp.ffmpegPath)) throw new Error("ffmpeg binary not found, run npm install");
        Files.setFfmpegPath(Network.ytdlp.ffmpegPath);

        Files.cleanTemp();
        this.clean();
        var cleaner = setInterval(() => this.clean(), 24 * 60 * 60 * 1000);

        process.once("SIGINT", () => this.stop("SIGINT"));
        process.once("SIGTERM", () => this.stop("SIGTERM"));

        this.app.start(async ctx => {
            if (ctx.chat.type != "private") return ctx.reply("Sorry, bot only works in DMs");
            ctx.reply(Files.startText);
        })

        this.app.action("send", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            user.send();
        })

        this.app.action("sendAll", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            user.sendPlaylist();
        })

        this.app.action("null", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            if (user.status == "poster") {
                user.setPoster(null);
                user.sendMenu("poster");
                return;
            }
            if (user.status == "performer") {
                user.getAudio().performer = null;
                user.sendMenu("default");
                return;
            }
        })

        this.app.action("default", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            if (user.status == "poster") {
                user.setPoster("default");
                user.sendMenu("poster");
                return;
            }
            if (user.status == "performer") {
                user.getAudio().performer = user.getAudio().source.performer;
                user.sendMenu("default");
                return;
            }
            if (user.status == "start") {
                user.audio.start = null;
                user.sendMenu("default");
                return;
            }
            if (user.status == "end") {
                user.audio.end = null;
                user.sendMenu("default");
                return;
            }

        })

        this.app.action("cancel", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            if (user.status == "poster" && user.getAudio().poster) user.sendMenu("new");
            else user.sendMenu("default");
        })

        this.app.action("next", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            if (user.mode != "playlist") return;
            if (user.playlistId + 1 == user.playlist.length) return;
            user.playlistId += 1;
            user.sendMenu();
        })

        this.app.action("prev", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            if (user.mode != "playlist") return;
            if (user.playlistId == 0) return;
            user.playlistId -= 1;
            user.sendMenu();
        })

        this.app.action("title", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            user.sendMenu("title");
        })

        this.app.action("performer", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            user.sendMenu("performer");
        })

        this.app.action("poster", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            user.sendMenu("poster");
        })

        this.app.action("delete", async ctx => {
            var user = User.getUser(ctx);
            if (!user.isAdmin()) return ctx.answerCbQuery("Only admin can delete audio from server", {show_alert: true});
            ctx.answerCbQuery().catch(() => {});
            if (user.status != "default") return;
            ctx.deleteMessage(user.menu).catch(() => {});
            user.menu = null;
            user.status = "none";
            Files.delete(user.getSourcePath());
            user.parseLink().then(() => user.sendMenu("new"));
        })

        this.app.action("start", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            if (user.mode == "playlist") return;
            user.sendMenu("start");
        })

        this.app.action("end", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            if (user.mode == "playlist") return;
            user.sendMenu("end");
        })

        this.app.command("help", async ctx => {
            ctx.reply(Files.helpText);
        })

        this.app.command("cookies", async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            ctx.reply(`YouTube asks for a login on age restricted videos and when it blocks the server as a bot.\nSend your YouTube cookies to this chat as a cookies.txt file in Netscape format. The file gives access to your account, use a secondary account.\nThe cookies are used only for your own requests and only when a video needs them. Only YouTube and Google cookies are kept.\nUse /removecookies to delete them.\nCookies: ${user.hasCookies() ? "saved" : "not saved"}`);
        })

        this.app.command("removecookies", async ctx => {
            if (ctx.chat.type != "private") return;
            User.getUser(ctx).removeCookies();
        })

        this.app.on(filters.message("text"), async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);

            if (user.status == "none" || user.status == "default") {
                var urls = Utility.getUrls(ctx);
                if (urls.length == 0) {
                    // Youtube search
                    return;
                }
                else if (urls.length == 1) {
                    // Single file
                    user.mode = "youtube";
                    user.audio = new Audio(urls[0]);
                    user.setPoster("default");
                    user.parseLink().then(() => user.sendMenu("new"));
                }
                else {
                    // Batch
                    if (!user.isAdmin() && urls.length > User.maxPlaylist) return user.updateStatus(`Too many links, send up to ${User.maxPlaylist} at once`);
                    user.mode = "playlist";
                    user.playlist = urls.map(url => new Audio(url));
                    user.parsePlaylist();
                }
            }
            else if (user.status == "loading") {
                user.updateStatus("Please wait for previous request to finish");
            }
            else if (user.status == "performer") {
                if (ctx.message.text.length > User.textLimit) return user.updateStatus("Performer is too long");
                user.getAudio().performer = ctx.message.text;
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                user.sendMenu("default");
            }
            else if (user.status == "title") {
                if (ctx.message.text.length > User.textLimit) return user.updateStatus("Title is too long");
                user.getAudio().title = ctx.message.text;
                user.sendMenu("default");
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
            }
            else if (user.status == "start") {
                var seconds = Utility.parseTimecode(ctx.message.text);
                if (seconds == null) return user.updateStatus("Incorrect format");
                if (seconds >= user.audio.source.duration) return user.updateStatus("Start timecode cannot be more than total duration");
                if (user.audio.end && seconds >= user.audio.end) return user.updateStatus("Start timecode cannot be more than end timecode");
                user.clearStatus();
                user.audio.start = seconds;
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                user.sendMenu("default");
            }
            else if (user.status == "end") {
                var seconds = Utility.parseTimecode(ctx.message.text);
                if (seconds == null) return user.updateStatus("Incorrect format");
                if (seconds >= user.audio.source.duration) return user.updateStatus("End timecode cannot be more than total duration");
                if (seconds <= (user.audio.start ?? 0)) return user.updateStatus("End timecode must be more than start timecode");
                user.clearStatus();
                user.audio.end = seconds;
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                user.sendMenu("default");
            }
        })

        this.app.on(filters.message("photo"), async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);

            if (user.status == "default" || user.status == "poster") {
                var photo = ctx.message.photo.toReversed().find(photo => photo.file_size && photo.file_size < Network.posterFileLimit);
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                if (!photo) return user.updateStatus("Poster is too big");
                user.setCustomPoster(photo.file_id);
            }
        })

        this.app.on(filters.message("document"), async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            var document = ctx.message.document;

            if (document.file_name?.toLowerCase().endsWith(".txt")) {
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                user.setCookies(document);
            }
        })

        this.app.on(filters.message("audio"), async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            var caption = ctx.message.caption;

            if (user.isAdmin() && caption && App.largeFiles[caption]) {
                App.largeFiles[caption](ctx.message.audio.file_id);
                delete App.largeFiles[caption];
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
            }
        });

        await this.app.launch({dropPendingUpdates: true}, () => {
            console.log("\n\nStarted!\n");
            this.app.telegram.sendMessage(Files.config.admin, "Started", {disable_notification: true});
        });
        clearInterval(cleaner);
    }

    /**
     * @param {string} signal
     */
    static stop(signal) {
        try {
            this.app.stop(signal);
        }
        catch {
            process.exit(0);
        }
    }

    static {
        this.start().catch(error => {
            console.log(error);
            process.exit(1);
        });
    }
}

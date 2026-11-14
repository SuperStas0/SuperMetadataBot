import { Network } from "./src/network.js";
import { Files } from "./src/files.js";
import { User } from "./src/user.js";
import { Utility } from "./src/utility.js";
import { AudioSettings } from "./src/audio.js";
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

    static async start() {
        process.on("unhandledRejection", error => console.log(error));
        this.app.catch(error => console.log(error));

        await Network.ffmpegStatus;
        Files.setFfmpegPath(Network.ytdlp.ffmpegPath);

        this.app.start(async ctx => {
            if (ctx.chat.type != "private") return ctx.reply("Sorry, bot only works in DMs");
            ctx.reply("Hello\nThis bot is meant to download and edit audio\nFor full usage instructions use /help");
        })

        this.app.action("send", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            user.send();
        })

        this.app.action("sendAll", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            user.sendPlaylist();
        })

        this.app.action("null", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            if (user.status == "poster") {
                user.setPoster(null);
                user.sendMenu("poster");
                return;
            }
            if (user.status == "performer") {
                user.getSettings().performer = null;
                user.sendMenu("default");
                return;
            }
        })

        this.app.action("default", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            if (user.status == "poster") {
                user.setPoster("default");
                user.sendMenu("poster");
                return;
            }
            if (user.status == "performer") {
                user.getSettings().performer = Files.loadAudio(user.getSourcePath()).performer;
                user.sendMenu("default");
                return;
            }
            if (user.status == "start") {
                user.settings.start = null;
                user.sendMenu("default");
                return;
            }
            if (user.status == "end") {
                user.settings.end = null;
                user.sendMenu("default");
                return;
            }

        })

        this.app.action("cancel", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            if (user.status == "poster" && user.getSettings().poster) user.sendMenu("new");
            else user.sendMenu("default");
        })

        this.app.action("next", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            if (user.mode != "playlist") return;
            if (user.playlistId + 1 == user.audio.length) return;
            user.playlistId += 1;
            user.sendMenu();
        })

        this.app.action("prev", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            if (user.mode != "playlist") return;
            if (user.playlistId == 0) return;
            user.playlistId -= 1;
            user.sendMenu();
        })

        this.app.action("title", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            user.status = "title";
            user.sendMenu("title");
        })

        this.app.action("performer", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            user.sendMenu("performer");
        })

        this.app.action("poster", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            user.sendMenu("poster");
        })

        this.app.action("delete", async ctx => {
            var user = User.getUser(ctx);
            if (!user.isAdmin()) return ctx.answerCbQuery("Only admin can delete audio from server", {show_alert: true});
            ctx.answerCbQuery().catch(() => {});;
            ctx.deleteMessage(user.menu).catch(() => {});
            user.menu = null;
            user.status = "none";
            Files.delete(user.getSourcePath());
            await user.parseLink();
            user.sendMenu("new")
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
                    user.audio = urls[0]
                    user.mode = "youtube";
                    user.settings = new AudioSettings();
                    user.setPoster("default");
                    user.parseLink().then(() => user.sendMenu("new"));
                }
                else {
                    // Batch
                    user.mode = "playlist";
                    user.playlistId = 0;
                    user.audio = urls;
                    user.playlistSettings = urls.map(() => new AudioSettings());
                    while (user.playlistId < user.audio.length) {
                        user.setPoster("default");
                        if (await user.parseLink()) user.playlistId++;
                        else {
                            user.audio.splice(user.playlistId, 1);
                            user.playlistSettings.splice(user.playlistId, 1);
                        }
                    }
                    user.status = user.audio.length ? "default" : "none";
                    user.playlistId = 0;
                    user.sendMenu("new")
                    return;
                }
            }
            else if (user.status == "loading") {
                user.updateStatus("Please wait for previous request to finish");
            }
            else if (user.status == "performer") {
                user.getSettings().performer = ctx.message.text;
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                user.sendMenu("default");
            }
            else if (user.status == "title") {
                user.getSettings().title = ctx.message.text;
                user.sendMenu("default");
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
            }
            else if (user.status == "start") {
                var seconds = ctx.message.text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
                if (Number.isNaN(seconds)) return user.updateStatus("Incorrect format");
                if (seconds < 0) return user.updateStatus("Start timecode cannot be less than 0");
                if (seconds >= Files.loadAudio(user.getSourcePath()).duration) return user.updateStatus("Start timecode cannot be more than total duration");
                if (user.settings.end && seconds >= user.settings.end) return user.updateStatus("Start timecode cannot be more than end timecode");
                user.clearStatus();
                user.settings.start = seconds;
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                user.sendMenu("default");
            }
            else if (user.status == "end") {
                var seconds = ctx.message.text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
                if (Number.isNaN(seconds)) return user.updateStatus("Incorrect format");
                if (seconds < 0) return user.updateStatus("End timecode cannot be less than 0");
                if (seconds >= Files.loadAudio(user.getSourcePath()).duration) return user.updateStatus("End timecode cannot be more than total duration");
                if (user.settings.start && seconds <= user.settings.start) return user.updateStatus("End timecode cannot be less than start timecode");
                user.clearStatus();
                user.settings.end = seconds;
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
                var fileLink = await this.app.telegram.getFileLink(photo.file_id);
                if (!await Network.downloadImage(fileLink, user.getPosterPath()).catch(() => false)) return user.updateStatus("Failed to download poster");
                user.clearStatus();
                user.setPoster(photo.file_id);
                user.sendMenu("poster");
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
    }

    static {
        this.start().catch(error => {
            console.log(error);
            process.exit(1);
        });
    }
}

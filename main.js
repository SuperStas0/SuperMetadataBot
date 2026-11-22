import { Network } from "./src/network.js";
import { Files } from "./src/files.js";
import { User } from "./src/user.js";
import { Utility } from "./src/utility.js";
import { Audio } from "./src/audio.js";
import { Menus } from "./src/menus.js";
import { Log } from "./src/log.js";
import { History } from "./src/history.js";
import { Panel } from "./src/panel.js";
import { Telegraf, Markup} from "telegraf";
import filters from "telegraf/filters";

export class App {
    static app = new Telegraf(Files.config.botToken, {handlerTimeout: Infinity});

    /** @type {Record<number, User>} */
    static data = {};

    static largeFiles = {};

    static cacheAge = 7 * 24 * 60 * 60 * 1000;

    static cacheFolderAge = 30 * 24 * 60 * 60 * 1000;

    static cacheSize = 5 * 1024 * 1024 * 1024;

    /** @type {Set<number>} */
    static clearing = new Set();

    /**
     * @param {number} id
     */
    static async clearKeyboard(id) {
        if (Files.settings.cleared?.includes(id) || this.clearing.has(id)) return;
        this.clearing.add(id);
        try {
            var msg = await this.app.telegram.sendMessage(id, ".", {reply_markup: {remove_keyboard: true}, disable_notification: true});
            this.app.telegram.deleteMessage(id, msg.message_id).catch(() => {});
            (Files.settings.cleared ??= []).push(id);
            Files.saveSettings();
        }
        catch (error) {
            Log.error(`Clear keyboard (user ${id})`, error);
        }
        finally {
            this.clearing.delete(id);
        }
    }

    static clean(force) {
        try {
            if (!force && Object.values(this.data).some(user => user.status == "loading")) return;
            Files.cleanCache(this.cacheAge, this.cacheFolderAge, this.cacheSize);
        }
        catch (error) {
            Log.error("Clean cache", error);
        }
    }

    static async start() {
        Log.secrets = [Files.config.botToken, Files.config.apiHash, Files.config.sessionId].filter(secret => secret).map(secret => String(secret));
        process.on("unhandledRejection", error => Log.error("Unhandled rejection", error));
        this.app.catch(error => Log.error("Bot handler", error));

        if (!Network.ytdlp.ffmpegPath || !Files.exists(Network.ytdlp.ffmpegPath)) throw new Error("ffmpeg binary not found, run npm install");
        Files.setFfmpegPath(Network.ytdlp.ffmpegPath);

        Files.cleanTemp();
        this.clean();
        var cleaner = setInterval(() => this.clean(), 24 * 60 * 60 * 1000);

        process.once("SIGINT", () => this.stop("SIGINT"));
        process.once("SIGTERM", () => this.stop("SIGTERM"));

        this.app.use(async (ctx, next) => {
            if (Files.settings.locked && ctx.from?.id != Files.config.admin) {
                if (ctx.callbackQuery) ctx.answerCbQuery("This bot is private").catch(() => {});
                else if (ctx.chat?.type == "private") ctx.reply("This bot is private").catch(() => {});
                return;
            }
            if (ctx.chat?.type == "private") this.clearKeyboard(ctx.chat.id);
            if (ctx.chat?.type == "private" && ctx.callbackQuery?.data != "searchYes") this.data[ctx.chat.id]?.removeAsk();
            try {
                await next();
            }
            finally {
                var entity = ctx.message?.entities?.[0];
                if (ctx.chat?.type == "private" && entity?.type == "bot_command" && entity.offset == 0) ctx.deleteMessage(ctx.message.message_id).catch(() => {});
            }
        })

        this.app.start(async ctx => {
            if (ctx.chat.type != "private") return ctx.reply("Sorry, bot only works in DMs");
            ctx.reply(Files.startText, Menus.Simple);
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
                user.applyPoster(null);
                user.sendMenu("poster");
                return;
            }
            if (user.status == "performer") {
                user.setPerformer(null);
                user.sendMenu("default");
                return;
            }
        })

        this.app.action("default", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            if (user.status == "poster") {
                if (!user.hasDefaultPoster()) return user.updateStatus("This audio has no default poster");
                user.applyPoster("default");
                user.sendMenu("poster");
                return;
            }
            if (user.status == "performer") {
                user.resetPerformer();
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

        this.app.action("square", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            user.toggleSquare();
        })

        this.app.action("playlistLoad", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            user.loadPending();
        })

        this.app.action("playlistCancel", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            user.removeConfirm();
        })

        this.app.action("cuts", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            var user = User.getUser(ctx);
            if (user.status != "default") return;
            user.sendMenu("cuts");
        })

        this.app.action(/^cutAdd:(\d+)$/, async ctx => {
            ctx.answerCbQuery().catch(() => {});
            User.getUser(ctx).addSuggested(Number(ctx.match[1]));
        })

        this.app.action("cutsAddAll", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            User.getUser(ctx).addSuggested(null);
        })

        this.app.action(/^cutRemove:(\d+)$/, async ctx => {
            ctx.answerCbQuery().catch(() => {});
            User.getUser(ctx).removeCut(Number(ctx.match[1]));
        })

        this.app.action("cutsClear", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            User.getUser(ctx).applyCuts([]);
        })

        this.app.action(/^search:(\d+)$/, async ctx => {
            ctx.answerCbQuery().catch(() => {});
            User.getUser(ctx).pickResult(Number(ctx.match[1]));
        })

        this.app.action("searchYes", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            User.getUser(ctx).confirmSearch();
        })

        this.app.action("searchCancel", async ctx => {
            ctx.answerCbQuery().catch(() => {});
            User.getUser(ctx).removeSearch();
        })

        this.app.command("search", async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            var query = ctx.message.text.replace(/^\/search(@\w+)?/i, "").replace(/\s+/g, " ").trim().slice(0, 200);
            if (!query) return user.notify("Send /search and what to look for, for example /search Never gonna give you up");
            user.search(query);
        })

        this.app.command("error", async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            if (!user.isAdmin()) return user.notify("Only admin can view errors");
            user.notify(Log.last() ?? "No errors logged");
        })

        this.app.hears(/^\/log_(\d+)$/, async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            if (!user.isAdmin()) return;
            var entry = History.get(Number(ctx.match[1]));
            if (!entry) return user.notify("Entry not found");
            var details = History.getDetails(entry);
            var extra = details.length <= 1000 ? {caption: details.text, parse_mode: "MarkdownV2"} : {};
            try {
                if (entry.document) await this.app.telegram.sendDocument(user.id, entry.fileId, extra);
                else await this.app.telegram.sendAudio(user.id, entry.fileId, extra);
                if (!extra.caption) await this.app.telegram.sendMessage(user.id, details.text, {parse_mode: "MarkdownV2"});
            }
            catch (error) {
                Log.error(`Send log entry ${entry.id}`, error);
                user.notify("Failed to send the audio");
            }
        })

        this.app.command("admin", async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            if (!user.isAdmin()) return;
            Panel.open(user);
        })

        this.app.action(/^panel:(\w+)(?::(\d+))?$/, async ctx => {
            var user = User.getUser(ctx);
            if (!user.isAdmin()) return ctx.answerCbQuery().catch(() => {});
            await Panel.handle(ctx, user, ctx.match[1], Number(ctx.match[2] ?? 0));
        })

        this.app.action(/^large:(allow|deny):(\d+)$/, async ctx => {
            var user = User.getUser(ctx);
            if (!user.isAdmin()) return ctx.answerCbQuery().catch(() => {});
            var done = Panel.answer(Number(ctx.match[2]), ctx.match[1] == "allow");
            ctx.answerCbQuery(done ? undefined : "Request expired").catch(() => {});
        })

        this.app.command("help", async ctx => {
            ctx.reply(Files.helpText, Menus.Simple);
        })

        this.app.command("cookies", async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            ctx.reply(`${Files.cookiesText}\nCookies: *${user.hasCookies() ? "saved" : "not saved"}*${!user.hasCookies() && user.getCookies() ? "\n_The bot admin shares their cookies with you, sending your own is optional_" : ""}`, Menus.Simple);
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
                var lists = Utility.getPlaylistUrls(ctx);
                if (lists.length > 0) {
                    // Playlist
                    user.parseLists(lists, urls);
                }
                else if (urls.length == 0) {
                    // Youtube search
                    if (ctx.message.text.startsWith("/") || ctx.message.entities?.some(entity => entity.type == "url")) return;
                    user.askSearch(ctx.message.text);
                }
                else if (urls.length == 1) {
                    // Single file
                    user.loadSingle(urls[0]);
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
                user.setPerformer(ctx.message.text);
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                user.sendMenu("default");
            }
            else if (user.status == "title") {
                if (ctx.message.text.length > User.textLimit) return user.updateStatus("Title is too long");
                user.getAudio().title = ctx.message.text;
                user.sendMenu("default");
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
            }
            else if (user.status == "cuts") {
                var parsed = Utility.parseCuts(ctx.message.text, user.getAudio().source.duration);
                if (parsed.error) return user.updateStatus(parsed.error);
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                user.applyCuts([...user.getAudio().cuts, ...parsed.cuts]);
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
            else if (Utility.isAudioDocument(document)) {
                user.loadFile({id: document.file_id, uniqueId: document.file_unique_id, size: document.file_size, name: document.file_name, document: true});
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
            else {
                var audio = ctx.message.audio;
                user.loadFile({id: audio.file_id, uniqueId: audio.file_unique_id, size: audio.file_size, name: audio.file_name, title: audio.title, performer: audio.performer});
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
        Network.dropUserClient();
        try {
            this.app.stop(signal);
        }
        catch {
            process.exit(0);
        }
    }

    static {
        this.start().catch(error => {
            Log.error("Start", error);
            process.exit(1);
        });
    }
}

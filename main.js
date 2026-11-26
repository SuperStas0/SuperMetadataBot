import { Network } from "./src/network.js";
import { Files } from "./src/files.js";
import { User } from "./src/user.js";
import { Utility } from "./src/utility.js";
import { Audio } from "./src/audio.js";
import { Menus } from "./src/menus.js";
import { Log } from "./src/log.js";
import { History } from "./src/history.js";
import { Panel } from "./src/panel.js";
import { Telegraf } from "telegraf";
import filters from "telegraf/filters";

export class App {
    static app = new Telegraf(Files.config.botToken, {handlerTimeout: Infinity});

    /** @type {Record<number, User>} */
    static data = {};

    static largeFiles = {};

    static cachePresets = {
        scarce: {size: 2 * 1024 * 1024 * 1024, age: 24 * 60 * 60 * 1000, folderAge: 7 * 24 * 60 * 60 * 1000, interval: 60 * 60 * 1000},
        default: {size: 5 * 1024 * 1024 * 1024, age: 7 * 24 * 60 * 60 * 1000, folderAge: 30 * 24 * 60 * 60 * 1000, interval: 24 * 60 * 60 * 1000},
        ultimate: {size: 50 * 1024 * 1024 * 1024, age: 30 * 24 * 60 * 60 * 1000, folderAge: 180 * 24 * 60 * 60 * 1000, interval: 24 * 60 * 60 * 1000},
        disabled: {size: Infinity, age: Infinity, folderAge: Infinity, interval: 24 * 60 * 60 * 1000}
    };

    /** @type {NodeJS.Timeout | null} */
    static cleaner = null;

    static getCache() {
        return this.cachePresets[Files.getSetting("cacheSize")] ?? this.cachePresets.default;
    }

    static schedule() {
        clearInterval(this.cleaner);
        this.cleaner = setInterval(() => this.clean(), this.getCache().interval);
    }

    /** @type {Set<number>} */
    static clearing = new Set();

    /**
     * @param {number} [id]
     */
    static hasAccess(id) {
        if (id == Files.config.admin) return true;
        var access = Files.getSetting("access");
        return access == "public" || access == "confirm" && !!Files.settings.allowed?.includes(id);
    }

    /**
     * @param {string | RegExp} trigger
     * @param {(user: User, ctx: Context) => any} handler
     */
    static action(trigger, handler) {
        this.app.action(trigger, async ctx => {
            ctx.answerCbQuery().catch(() => {});
            handler(User.getUser(ctx), ctx);
        })
    }

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
            var cache = this.getCache();
            Files.cleanCache(cache.age, cache.folderAge, cache.size, force ? Network.minFreeSpace : 0);
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
        this.schedule();

        process.once("SIGINT", () => this.stop("SIGINT"));
        process.once("SIGTERM", () => this.stop("SIGTERM"));

        this.app.use(async (ctx, next) => {
            if (!this.hasAccess(ctx.from?.id)) {
                var confirm = Files.getSetting("access") == "confirm";
                if (ctx.callbackQuery) ctx.answerCbQuery(confirm ? "Access is not allowed yet" : "This bot is private").catch(() => {});
                else if (ctx.chat?.type == "private") ctx.reply(confirm ? Panel.requestAccess(ctx.from.id, User.getName(ctx), ctx.message ? ctx.update : null) : "This bot is private").catch(() => {});
                return;
            }
            if (ctx.chat?.type == "private") {
                this.clearKeyboard(ctx.chat.id);
                if (ctx.callbackQuery?.data != "searchYes") this.data[ctx.chat.id]?.removeAsk();
            }
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

        this.action("send", user => user.send());

        this.action("sendAll", user => user.sendPlaylist());

        this.action("null", user => {
            if (user.status == "poster") {
                user.applyPoster(null);
                user.sendMenu("poster");
            }
            else if (user.status == "performer") {
                user.setPerformer(null);
                user.sendMenu("default");
            }
        })

        this.action("default", user => {
            if (user.status == "poster") {
                if (!user.hasDefaultPoster()) return user.updateStatus("This audio has no default poster");
                user.applyPoster("default");
                user.sendMenu("poster");
            }
            else if (user.status == "performer") {
                user.resetPerformer();
                user.sendMenu("default");
            }
        })

        this.action("cancel", user => user.back());

        this.action("next", user => {
            if (user.mode != "playlist" || user.playlistId + 1 == user.playlist.length) return;
            user.playlistId += 1;
            user.sendMenu(user.status == "order" ? "order" : "new");
        })

        this.action("prev", user => {
            if (user.mode != "playlist" || user.playlistId == 0) return;
            user.playlistId -= 1;
            user.sendMenu(user.status == "order" ? "order" : "new");
        })

        this.action("titles", user => user.startTitles());

        this.action("skip", user => user.nextTitle());

        this.action("order", user => user.startOrder());

        this.action("batch", user => user.toggleBatch());

        this.action("moveUp", user => user.moveCurrent(user.playlistId - 1));

        this.action("moveDown", user => user.moveCurrent(user.playlistId + 1));

        this.action("moveFirst", user => user.moveCurrent(0));

        this.action("moveLast", user => user.moveCurrent(user.playlist.length - 1));

        this.action("title", user => user.sendMenu("title"));

        this.action("performer", user => user.sendMenu("performer"));

        this.action("poster", user => user.sendMenu("poster"));

        this.action("format", user => user.toggleFormat());

        this.action("playlistLoad", user => user.loadPending());

        this.action("playlistCancel", user => user.removeConfirm());

        this.action("cuts", user => {
            if (user.status == "default") user.sendMenu("cuts");
        })

        this.action(/^cutAdd:(\d+)$/, (user, ctx) => user.addSuggested(Number(ctx.match[1])));

        this.action("cutsAddAll", user => user.addSuggested(null));

        this.action(/^cutRemove:(\d+)$/, (user, ctx) => user.removeCut(Number(ctx.match[1])));

        this.action("cutsClear", user => user.applyCuts([]));

        this.action(/^search:(\d+)$/, (user, ctx) => user.pickResult(Number(ctx.match[1])));

        this.action("searchYes", user => user.confirmSearch());

        this.action("searchCancel", user => user.removeSearch());

        this.action("searchAskCancel", user => user.removeAsk());

        this.action("stop", user => user.stop());

        this.app.command("search", async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            var query = ctx.message.text.replace(/^\/search(@\w+)?/i, "").replace(/\s+/g, " ").trim().slice(0, 200);
            if (!query) return user.notify("Send /search and what to look for, for example /search Never gonna give you up");
            user.search(query);
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

        this.app.action(/^ask:(allow|deny):(\d+)$/, async ctx => {
            var user = User.getUser(ctx);
            if (!user.isAdmin()) return ctx.answerCbQuery().catch(() => {});
            var done = Panel.answer(Number(ctx.match[2]), ctx.match[1]);
            ctx.answerCbQuery(done ? undefined : "Request expired").catch(() => {});
        })

        this.app.command("help", async ctx => {
            ctx.reply(Files.helpText, Menus.Simple);
        })

        this.app.command("cookies", async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            ctx.reply(`${Files.cookiesText}\nCookies: *${user.hasCookies() ? "saved" : "not saved"}*${!user.hasCookies() && user.getSharedCookies() ? `\n_The bot admin shares their cookies with you${Files.getSetting("shareCookies") == "confirm" ? " after confirming" : ""}, sending your own is optional_` : ""}`, Menus.Simple);
        })

        this.app.command("removecookies", async ctx => {
            if (ctx.chat.type != "private") return;
            User.getUser(ctx).removeCookies();
        })

        this.app.on(filters.message("text"), async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);

            if (Panel.listing && user.isAdmin() && (user.status == "none" || user.status == "default")) {
                if (!ctx.message.text.startsWith("/")) Panel.setFilter(ctx, ctx.message.text);
                return;
            }

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
            else if (user.status == "titles") {
                if (ctx.message.text.length > User.textLimit) return user.updateStatus("Title is too long");
                user.getAudio().title = ctx.message.text;
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                user.nextTitle();
            }
            else if (user.status == "order") {
                var error = user.applyMoves(ctx.message.text);
                if (error) return user.updateStatus(error);
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
            }
            else if (user.status == "poster") {
                var links = Utility.getUrls(ctx);
                if (links.length > 1 || !links.length && (ctx.message.text.startsWith("/") || ctx.message.entities?.some(entity => entity.type == "url"))) return;
                ctx.deleteMessage(ctx.message.message_id).catch(() => {});
                if (links.length) user.setLinkPoster(links[0]);
                else user.askSearch(ctx.message.text, true);
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
                user.loadFile({id: document.file_id, uniqueId: document.file_unique_id, size: document.file_size, name: document.file_name, document: true, messageId: ctx.message.message_id, thumbnailId: document.thumbnail?.file_id});
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
                user.loadFile({id: audio.file_id, uniqueId: audio.file_unique_id, size: audio.file_size, name: audio.file_name, title: audio.title, performer: audio.performer, messageId: ctx.message.message_id, thumbnailId: audio.thumbnail?.file_id});
            }
        });

        await this.app.launch({dropPendingUpdates: true}, () => {
            console.log("\n\nStarted!\n");
            this.app.telegram.sendMessage(Files.config.admin, "Started", {disable_notification: true});
        });
        clearInterval(this.cleaner);
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

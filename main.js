import { Network } from "./src/network";
import { Telegraf, Context, Markup} from "telegraf";
import filters from "telegraf/filters";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { join } from "path";
import ffmpeg from "fluent-ffmpeg";


class Menus {
    /**
     * @param {[string, string, number][]} buttons
     * @returns {Markup}
     */
    static GenerateMarkup(...buttons){
        var rows = [];
        buttons.forEach(([name, command, row]) => {
            rows[row] ??= [];
            rows[row].push(Markup.button.callback(name, command));
        });
        return {...Markup.inlineKeyboard(rows), parse_mode: "MarkdownV2"};
    }

    static Simple = {parse_mode: "MarkdownV2"};

    static Main = this.GenerateMarkup(["Send", "send", 0], ["Title", "title", 1], ["Performer", "performer", 1], ["Start", "start", 2], ["End", "end", 2], ["Poster", "poster", 3], ["Delete", "delete", 4]);

    static Playlist = this.GenerateMarkup(["Send", "send", 0], ["Title", "title", 1], ["Performer", "performer", 1], ["Poster", "poster", 2], ["Previous", "prev", 3], ["Next", "next", 3], ["Send All", "sendAll", 4]);

    static Cancel = this.GenerateMarkup(["Cancel", "cancel", 0]);

    static CancelWithNull = this.GenerateMarkup(["Null", "null", 0], ["Cancel", "cancel", 1]);

    static Choice = this.GenerateMarkup(["1", "select", 0])

    static DefaultOnly = this.GenerateMarkup(["Set default", "default", 0], ["Cancel", "cancel", 1]);

    static RemoveOnly = this.GenerateMarkup(["Remove", "null", 0], ["Cancel", "cancel", 1]);

    static DefaultNRemove = this.GenerateMarkup(["Set default", "default", 0], ["Remove", "null", 1], ["Cancel", "cancel", 2]);
}

class Utility {
    /**
     * @param {number} duration
     * @param {number} start
     * @param {number} end
     */
    static getDuration(duration, start, end) {
        start ??= 0;
        end ??= duration;
        return end-start;
    }

    /**
     * @param {number} duration
     */
    static getDurationString(duration) {
        var mins = Math.floor(duration / 60);
        var secs = Math.floor(duration % 60);
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
    }

}

class User {
    /**
     * @param {Context} ctx
     */
    constructor (ctx){
        /** @type {number} */
        this.id = ctx.chat.id;
        this.statusMessage;
        /** @type {"none" | "youtube" | "telegram" | "playlist"} */
        this.mode = "none";
        /** @type {UserStatus} */
        this.status = "none";
        /** @type {string | string[] | null} */
        this.audio;
        /** @type {number | null} */
        this.playlistId;
        /** @type {string | null} */
        this.posterId;
        /** @type {number | null} */
        this.menu;
        this.settings = {
            /** @type {string | string[] | null} */
            title: null,
            /** @type {string | null} */
            performer: null,
            /** @type {number | null} */
            start: null,
            /** @type {number | null} */
            end: null,
            /** @type {"default" | "custom" | null} */
            poster: null
        }
    }

    async parseLink() {
        this.status = "loading";

        var url = this.mode == "playlist" ? this.audio[this.playlistId] : this.audio;
        url = `https://www.youtube.com/watch?v=${Network.getIdFromUrl(url)}`;
        var path = this.getSourcePath();
        var info, audio, poster;

        this.updateStatus(`Fetching: ${url}`);

        Files.createFolder(path);
        if (!Files.exists(join(path, "data.json"))) {
            info = Network.fetchInfo(url).then(metadata => Files.saveAudio(path, {id: null, title: metadata.title, performer: metadata.channel, duration: metadata.duration || 0}));
        }
        if (!Files.exists(join(path, "audio.m4a"))) {
            this.updateStatus(`Downloading: ${url}`);
            audio = Network.downloadMusic(url, path, true).then(() => this.updateStatus(`Fetching: ${url}`));
        }
        if (!Files.exists(join(path, "poster.jpg"))) poster = Network.downloadPoster(url, path);

        await Promise.all([info, audio, poster]);

        this.status = "default";
        this.settings.performer = Files.loadAudio(path).performer;
        this.clearStatus();
        await this.sendSource();
    }

    async send() {
        if (this.status != "default") return;

        var sourcePath = this.getSourcePath();
        var data = Files.loadAudio(sourcePath);
        var title = (this.mode == "playlist" ? this.settings.title[this.playlistId] : this.settings.title) ?? data.title;
        var path = this.getUserPath();
        var audioPath = join(path, `${title}.m4a`);
        var duration = this.mode == "playlist" ? data.duration : Utility.getDuration(data.duration, this.settings.start, this.settings.end);

        this.status = "loading";
        this.updateStatus(`Uploading: ${title}`);
        App.app.telegram.deleteMessage(this.id, this.menu);
        this.menu = null;

        if (this.mode != "playlist" && (this.settings.start || this.settings.end)) await Files.cut(join(sourcePath, "audio.m4a"), audioPath, this.settings.start, duration);
        else Files.copy(join(sourcePath, "audio.m4a"), audioPath);

        await Network.uploadFile(this.id, audioPath, {title: title, performer: this.settings.performer, duration: duration, thumbnail: this.settings.poster && {source: join(this.settings.poster == "default" ? sourcePath : path, "poster.jpg")}});

        this.status = "default";
        this.clearStatus();
        this.sendMenu();

    }

    async sendSource() {
        if (this.status != "default") return;

        var path = this.getSourcePath();
        var data = Files.loadAudio(path);

        if (data.id) await App.app.telegram.sendAudio(this.id, data.id);
        else {
            this.updateStatus(`Uploading: ${data.title}`);
            var msg = await Network.uploadFile(this.id, join(path, "audio.m4a"), {title: data.title, performer: data.performer, duration: data.duration, thumbnail: {source: join(path, "poster.jpg")}});
            data.id = msg.audio.file_id;
            Files.saveAudio(path, data);
            this.clearStatus();
        }
    }

    async sendPlaylist() {
        if (this.mode != "playlist") return;
        var last = this.playlistId;
        this.playlistId = 0;
        for (let _ of this.settings.title) {
            await this.send();
            this.playlistId += 1;
        }
        this.playlistId = last;
    }

    /**
     * @param {"new" | "default" | "title" | "performer" | "poster" | "start" | "end"} mode
     */
    async sendMenu(mode) {
        if (this.status == "loading" || this.status == "none") return;
        if (!mode) mode = "new";

        var menuText = this.getMenuText(mode).replaceAll(".", "\\.").replaceAll("-", "\\-");
        this.status = mode;

        if (mode == "new") {
            if (this.menu) App.app.telegram.deleteMessage(this.id, this.menu);
            this.status = "default";
            App.app.telegram.sendMessage(this.id, menuText, this.mode == "playlist" ? Menus.Playlist : Menus.Main).then(msg => this.menu = msg.message_id);
        }
        else if (mode == "default") {
            try {
                await App.app.telegram.editMessageText(this.id, this.menu, null, menuText, this.mode == "playlist" ? Menus.Playlist : Menus.Main);
            }
            catch (error) {
                if (!error.response?.description?.includes("message is not modified")) {
                    console.log(error.response.description);
                }
            }
        }
        else if (mode == "title") App.app.telegram.editMessageText(this.id, this.menu, null, menuText, Menus.Cancel);
        else if (mode == "performer") App.app.telegram.editMessageText(this.id, this.menu, null, menuText, this.settings.performer ? (this.settings.performer == Files.loadAudio(this.getSourcePath()).performer ? Menus.RemoveOnly : Menus.DefaultNRemove) : Menus.DefaultOnly);
        else if (mode == "poster") {
            if (this.settings.poster) {
                App.app.telegram.deleteMessage(this.id, this.menu);
                var poster = this.posterId;
                var data;
                if (this.settings.poster == "default") {
                    data = Files.loadAudio(this.getSourcePath());
                    poster = data.posterId ?? {source: join(this.getSourcePath(), "poster.jpg")};
                }
                var msg = await App.app.telegram.sendPhoto(this.id, poster, {...(this.settings.poster == "default" ? Menus.RemoveOnly : Menus.DefaultNRemove), caption: menuText});
                this.menu = msg.message_id;
                if (data && !data.posterId) {
                    data.posterId = msg.photo.toReversed()[0].file_id;
                    Files.saveAudio(this.getSourcePath(), data);
                }
            }
            else {
                try {
                    await App.app.telegram.editMessageText(this.id, this.menu, null, menuText, Menus.DefaultOnly);
                }
                catch (error) {
                    App.app.telegram.deleteMessage(this.id, this.menu);
                    var msg = await App.app.telegram.sendMessage(this.id, menuText, Menus.DefaultOnly);
                    this.menu = msg.message_id;
                }
            }
        }
        else if (mode == "start" || mode == "end") App.app.telegram.editMessageText(this.id, this.menu, null, menuText, Menus.DefaultOnly);
    }

    removeMenu() {
        if (!this.menu) return;
        App.app.telegram.deleteMessage(this.id, this.menu);
    }

    /**
     * @param {"default"| {} & string | null} mode
     */
    setPoster(mode) {
        if (!mode) this.settings.poster = null;
        else if (mode == "default") this.settings.poster = "default";
        else {
            this.settings.poster = "custom";
            this.posterId = mode;
        }

    }

    isAdmin() {
        return this.id == Files.config.admin;
    }

    /**
     * @param {string} message
     */
    updateStatus(message) {
        if (this.statusMessage) return this.statusMessage.then(msg => App.app.telegram.editMessageText(this.id, msg.message_id, null, message)).catch(() => {});
        this.statusMessage = App.app.telegram.sendMessage(this.id, message);
    }

    clearStatus() {
        if (!this.statusMessage) return;
        this.statusMessage.then(msg => App.app.telegram.deleteMessage(this.id, msg.message_id));
        this.statusMessage = null;
    }

    getSourcePath() {
        if (!this.audio) return;
        return join("downloads", this.mode == "playlist" ? "youtube" : this.mode, this.mode == "telegram" ? this.audio : Network.getIdFromUrl(this.mode == "playlist" ? this.audio[this.playlistId] : this.audio));
    }

    getUserPath() {
        return join("downloads", "users", this.id.toString());
    }

    getInfo() {
        var data = Files.loadAudio(this.getSourcePath())
        var info = {};

        /** @type {string} */
        info.title = (this.mode == "playlist" ? this.settings.title[this.playlistId] : this.settings.title) ?? data.title;
        info.performer = this.settings.performer;
        info.duration = data.duration;
        info.poster = this.settings.poster;
        info.start = this.settings.start;
        info.end = this.settings.end;

        info.text = "";
        if (this.mode == "playlist") info.text += `\`${this.playlistId+1}/${this.audio.length}\`\n`;
        info.text += `Title: \`${info.title}\`\n`;
        info.text += info.performer ? `Performer: \`${info.performer}\`\n` : "No performer\n";
        info.text += `Duration: \`${Utility.getDurationString(info.duration)}\`\n`;
        info.text += info.poster ? `Poster: ${{"default": "Youtube", "custom": "Custom"}[info.poster]}` : "No poster";
        if (info.start || info.end) info.text += `\nTrimming: \`${Utility.getDurationString(info.start ?? 0)}\` - \`${Utility.getDurationString(info.end ?? info.duration)}\``;

        return info;

    }

    /**
     * @param {"new" | "default" | "title" | "performer" | "poster" | "start" | "end"} mode
     */
    getMenuText(mode) {
        var info = this.getInfo();
        if (mode == "new" || mode == "default") return info.text;
        if (mode == "title") return `Current title: \`${info.title}\`\nSend new title`;
        if (mode == "performer") return info.performer ? `Current performer: \`${info.performer}\`\nSend new performer` : `Currently no performer\nSend new performer`;
        if (mode == "poster") return info.poster ? `Current poster\nSend new poster` : `Currently no poster\nSend new poster`;
        if (mode == "start" || mode == "end") return (info.start || info.end) ? `Trimming: \`${Utility.getDurationString(info.start ?? 0)}\` - \`${Utility.getDurationString(info.end ?? info.duration)}\`\nSend new trim ${mode} timecode as \`MM:SS\`\n` : `Trimming is not set\nSend trim ${mode} timecode as \`MM:SS\``;
    }

    /**
     * @param {Context} ctx
     * @returns {User}
     */
    static getUser(ctx) {
        var id = ctx.chat.id;
        if (!App.data[id]) {
            App.data[id] = new User(ctx);
            Files.createFolder(App.data[id].getUserPath());
        }
        return App.data[id];
    }
}

class App {
    static app = new Telegraf(Files.config.botToken, {handlerTimeout: Infinity});

    static userClient = new TelegramClient(new StringSession(Files.config.sessionId), Files.config.apiId, Files.config.apiHash, { connectionRetries: 5 });

    /** @type {Record<number, User>} */
    static data = {};

    static largeFiles = {};

    static {
        await Network.ffmpeg;
        ffmpeg.setFfmpegPath(Network.ytdlp.ffmpegPath);

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
                user.settings.performer = null;
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
                user.settings.performer = Files.loadAudio(user.getSourcePath()).performer;
                user.sendMenu("default");
                return;
            }

        })

        this.app.action("cancel", async ctx => {
            ctx.answerCbQuery().catch(() => {});;
            var user = User.getUser(ctx);
            if (user.status == "poster" && user.settings.poster) user.sendMenu("new");
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
            ctx.deleteMessage(user.menu);
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
                var urls = Network.getUrls(ctx);
                if (urls.length == 0) {
                    // Youtube search
                    return;
                }
                else if (urls.length == 1) {
                    // Single file
                    user.audio = urls[0]
                    user.mode = "youtube";
                    user.setPoster("default");
                    user.parseLink().then(() => user.sendMenu("new"));
                }
                else {
                    // Batch
                    user.mode = "playlist";
                    user.settings.poster = "default";
                    user.playlistId = 0;
                    user.audio = urls;
                    user.settings.title = [];
                    for (let _ of urls) {
                        await user.parseLink();
                        user.playlistId++;
                    }
                    user.playlistId = 0;
                    user.sendMenu("new")
                    return;
                }
            }
            else if (user.status == "loading") {
                user.updateStatus("Please wait for previous request to finish");
            }
            else if (user.status == "performer") {
                user.settings.performer = ctx.message.text;
                ctx.deleteMessage(ctx.message.message_id);
                user.sendMenu("default");
            }
            else if (user.status == "title") {
                if (user.mode == "playlist") user.settings.title[user.playlistId] = ctx.message.text;
                else user.settings.title = ctx.message.text;
                user.sendMenu("default");
                ctx.deleteMessage(ctx.message.message_id);
            }
            else if (user.status == "start") {
                var seconds = ctx.message.text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
                if (Number.isNaN(seconds)) return user.updateStatus("Incorrect format");
                if (seconds < 0) return user.updateStatus("Start timecode cannot be less than 0");
                if (seconds >= Files.loadAudio(user.getSourcePath()).duration) return user.updateStatus("Start timecode cannot be more than total duration");
                if (user.settings.end && seconds >= user.settings.end) return user.updateStatus("Start timecode cannot be more than end timecode");
                user.clearStatus();
                user.settings.start = seconds;
                ctx.deleteMessage(ctx.message.message_id);
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
                ctx.deleteMessage(ctx.message.message_id);
                user.sendMenu("default");
            }
        })

        this.app.on(filters.message("photo"), async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);

            if (user.status == "default" || user.status == "poster") {
                var fileId = ctx.message.photo.toReversed().find(photo => photo.file_size && photo.file_size < 200 * 1024).file_id;
                ctx.deleteMessage(ctx.message.message_id);
                user.setPoster(fileId);
                user.sendMenu("poster");
                var fileLink = await this.app.telegram.getFileLink(fileId);
                Network.downloadImage(fileLink, join(user.getUserPath(), "poster.jpg"));
            }
        })

        this.app.on(filters.message("audio"), async ctx => {
            if (ctx.chat.type != "private") return;
            var user = User.getUser(ctx);
            var caption = ctx.message.caption;

            if (user.isAdmin() && caption && App.largeFiles[caption]) {
                App.largeFiles[caption](ctx.message.audio.file_id);
                delete App.largeFiles[caption];
                ctx.deleteMessage(ctx.message.message_id);
            }
        });

        this.app.launch({dropPendingUpdates: true}, () => {
            console.log("\n\nStarted!\n");
            this.app.telegram.sendMessage(Files.config.admin, "Started", {disable_notification: true});
        });
    }
}

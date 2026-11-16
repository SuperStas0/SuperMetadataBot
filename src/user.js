import { App }  from "../main.js";
import { Utility } from "./utility.js";
import { Files } from "./files.js";
import { Audio, AudioSource } from "./audio.js";
import { Menus } from "./menus.js";
import { Network } from "./network.js";


export class User {
    static textLimit = 256;

    static maxPlaylist = 10;

    /**
     * @param {Context} ctx
     */
    constructor (ctx){
        /** @type {number} */
        this.id = ctx.chat.id;
        this.statusMessage;
        /** @type {UserMode} */
        this.mode = "none";
        /** @type {UserStatus} */
        this.status = "none";
        /** @type {Audio} */
        this.audio = new Audio();
        /** @type {Audio[]} */
        this.playlist = [];
        /** @type {number | null} */
        this.playlistId;
        /** @type {number | null} */
        this.menu;
    }

    getAudio() {
        return this.mode == "playlist" ? this.playlist[this.playlistId] : this.audio;
    }

    /**
     * @returns {Promise<boolean>}
     */
    async parseLink() {
        this.status = "loading";

        var audio = this.getAudio();
        var id = Utility.getIdFromUrl(audio.source.url);
        audio.source.url = `https://www.youtube.com/watch?v=${id}`;
        var url = audio.source.url;
        var path = this.getSourcePath();
        var admin = this.isAdmin();

        if (!Files.exists(Files.path(path, "audio.m4a")) && Files.getFreeSpace() < Network.minFreeSpace) {
            App.clean(true);
            if (Files.getFreeSpace() < Network.minFreeSpace) return this.decline("Not enough free space on the server, try again later");
        }

        this.updateStatus(`Fetching: ${url}`);

        try {
            await Utility.lock(path, async () => {
                var tasks = [];

                Files.createFolder(path);
                if (!Files.exists(Files.path(path, "data.json"))) {
                    var metadata = await Utility.timeout(Network.fetchInfo(url), Network.infoTimeout, "Fetching info timed out");
                    if (metadata.is_live) throw new Error("Live streams are not supported");
                    if (metadata.duration > Network.maxDuration) throw new Error("Video is too long");
                    Files.saveAudio(path, Object.assign(new AudioSource(), {title: metadata.title, performer: metadata.channel, duration: metadata.duration || 0}));
                }
                if (admin) {
                    var source = Files.loadAudio(path);
                    if (source.limited) {
                        Files.delete(Files.path(path, "audio.m4a"));
                        source.id = null;
                        source.limited = false;
                        Files.saveAudio(path, source);
                    }
                }
                if (!Files.exists(Files.path(path, "audio.m4a"))) {
                    this.updateStatus(`Downloading: ${url}`);
                    tasks.push(Utility.queue("download", Network.maxDownloads, () => Utility.timeout(Network.downloadMusic(url, path, admin), Network.downloadTimeout, "Downloading timed out")).then(() => {
                        var source = Files.loadAudio(path);
                        source.limited = !admin;
                        Files.saveAudio(path, source);
                        this.updateStatus(`Fetching: ${url}`);
                    }));
                }
                if (!Files.exists(Files.path(path, "poster.jpg"))) tasks.push(Network.downloadPoster(url, path));

                await Promise.all(tasks);
                Files.touch(Files.path(path, "audio.m4a"));
            });
            App.clean(true);

            audio.source = Files.loadAudio(path);
            audio.source.url = url;
            audio.performer = audio.source.performer;
            if (!admin && Files.getFileSize(Files.path(path, "audio.m4a")) >= Network.botFileLimit) {
                var sent = audio.source.id && await App.app.telegram.sendAudio(this.id, audio.source.id).then(() => true, () => false);
                return sent ? this.decline() : this.decline(`This audio is over the ${Network.botFileLimit / 1024 / 1024} MB limit of this bot. Host your own bot to remove the limit: https://github.com/SuperStas0/SuperMetadata`);
            }
            this.clearStatus();
            await this.sendSource();
            this.status = "default";
        }
        catch (error) {
            console.log(error);
            this.decline(`Failed to load: ${url}`);
            return false;
        }
        return true;
    }

    /**
     * @param {string} [text]
     */
    decline(text) {
        this.clearStatus();
        this.status = "none";
        if (text) App.app.telegram.sendMessage(this.id, text).catch(() => {});
        return false;
    }

    async send() {
        if (this.status != "default") return;

        var audio = this.getAudio();
        var source = audio.source;
        var title = audio.title ?? source.title;
        var path = this.getUserPath();
        var audioPath = Files.path(path, `${Utility.getFileName(title)}.m4a`);
        var duration = Utility.getDuration(source.duration, audio.start, audio.end);

        this.status = "loading";
        this.updateStatus(`Uploading: ${title}`);
        if (this.menu) App.app.telegram.deleteMessage(this.id, this.menu).catch(() => {});
        this.menu = null;

        try {
            if (audio.start || audio.end) await Files.cut(Files.path(source.path, "audio.m4a"), audioPath, audio.start, duration);
            else Files.copy(Files.path(source.path, "audio.m4a"), audioPath);

            await Network.uploadFile(this.id, audioPath, {title: title, performer: audio.performer, duration: duration, thumbnail: audio.poster && {source: audio.poster == "default" ? Files.path(source.path, "poster.jpg") : this.getPosterPath()}});
        }
        catch (error) {
            console.log(error);
            App.app.telegram.sendMessage(this.id, `Failed to send: ${title}`).catch(() => {});
        }
        Files.delete(audioPath);

        this.status = "default";
        this.clearStatus();
        await this.sendMenu();

    }

    async sendSource() {
        var source = this.getAudio().source;

        if (source.id) {
            try {
                await App.app.telegram.sendAudio(this.id, source.id);
                return;
            }
            catch (error) {
                console.log(error);
            }
        }
        this.updateStatus(`Uploading: ${source.title}`);
        var msg = await Network.uploadFile(this.id, Files.path(source.path, "audio.m4a"), {title: source.title, performer: source.performer, duration: source.duration, thumbnail: {source: Files.path(source.path, "poster.jpg")}});
        source.id = msg.audio.file_id;
        Files.saveAudio(source.path, source);
        this.clearStatus();
    }

    async parsePlaylist() {
        this.playlistId = 0;
        while (this.playlistId < this.playlist.length) {
            this.setPoster("default");
            if (await this.parseLink()) this.playlistId++;
            else this.playlist.splice(this.playlistId, 1);
        }
        this.status = this.playlist.length ? "default" : "none";
        this.playlistId = 0;
        await this.sendMenu("new");
    }

    async sendPlaylist() {
        if (this.mode != "playlist" || this.status != "default") return;
        var last = this.playlistId;
        this.playlistId = 0;
        for (var _ of this.playlist) {
            await this.send();
            this.playlistId += 1;
        }
        this.playlistId = last;
        await this.sendMenu();
    }

    /**
     * @param {"new" | "default" | "title" | "performer" | "poster" | "start" | "end"} [mode]
     */
    async sendMenu(mode) {
        if (this.status == "loading" || this.status == "none") return;
        if (!mode) mode = "new";

        this.clearStatus();
        var audio = this.getAudio();
        var menuText = this.getMenuText(mode).replaceAll(".", "\\.").replaceAll("-", "\\-");
        this.status = mode;

        if (mode == "new") {
            if (this.menu) App.app.telegram.deleteMessage(this.id, this.menu).catch(() => {});
            this.status = "default";
            var msg = await App.app.telegram.sendMessage(this.id, menuText, this.mode == "playlist" ? Menus.Playlist : Menus.Main);
            this.menu = msg.message_id;
        }
        else if (mode == "default") {
            try {
                await App.app.telegram.editMessageText(this.id, this.menu, null, menuText, this.mode == "playlist" ? Menus.Playlist : Menus.Main);
            }
            catch (error) {
                if (!error.response?.description?.includes("message is not modified")) {
                    console.log(error);
                }
            }
        }
        else if (mode == "title") this.editMenu(menuText, Menus.Cancel);
        else if (mode == "performer") this.editMenu(menuText, audio.performer ? (audio.performer == audio.source.performer ? Menus.RemoveOnly : Menus.DefaultNRemove) : Menus.DefaultOnly);
        else if (mode == "poster") {
            if (audio.poster) {
                App.app.telegram.deleteMessage(this.id, this.menu).catch(() => {});
                var poster = audio.posterId;
                if (audio.poster == "default") poster = audio.source.posterId ?? {source: Files.path(audio.source.path, "poster.jpg")};
                var msg = await App.app.telegram.sendPhoto(this.id, poster, {...(audio.poster == "default" ? Menus.RemoveOnly : Menus.DefaultNRemove), caption: menuText});
                this.menu = msg.message_id;
                if (audio.poster == "default" && !audio.source.posterId) {
                    audio.source.posterId = msg.photo.toReversed()[0].file_id;
                    Files.saveAudio(audio.source.path, audio.source);
                }
            }
            else {
                try {
                    await App.app.telegram.editMessageText(this.id, this.menu, null, menuText, Menus.DefaultOnly);
                }
                catch (error) {
                    if (!error.response?.description?.includes("no text in the message to edit")) console.log(error);
                    App.app.telegram.deleteMessage(this.id, this.menu).catch(() => {});
                    var msg = await App.app.telegram.sendMessage(this.id, menuText, Menus.DefaultOnly);
                    this.menu = msg.message_id;
                }
            }
        }
        else if (mode == "start" || mode == "end") this.editMenu(menuText, Menus.DefaultOnly);
    }

    /**
     * @param {string} text
     * @param {any} markup
     */
    async editMenu(text, markup) {
        try {
            await App.app.telegram.editMessageText(this.id, this.menu, null, text, markup);
        }
        catch (error) {
            if (!error.response?.description?.includes("message is not modified")) console.log(error);
        }
    }

    /**
     * @param {"default"| {} & string | null} mode
     */
    setPoster(mode) {
        var audio = this.getAudio();
        if (!mode) audio.poster = null;
        else if (mode == "default") audio.poster = "default";
        else {
            audio.poster = "custom";
            audio.posterId = mode;
        }

    }

    /**
     * @param {string} fileId
     */
    async setCustomPoster(fileId) {
        var fileLink = await App.app.telegram.getFileLink(fileId).catch(() => null);
        if (!fileLink || !await Network.downloadImage(fileLink, this.getPosterPath()).catch(() => false)) return this.updateStatus("Failed to download poster");
        this.clearStatus();
        this.setPoster(fileId);
        this.sendMenu("poster");
    }

    removeMenu() {
        if (!this.menu) return;
        App.app.telegram.deleteMessage(this.id, this.menu).catch(() => {});
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
        this.statusMessage.then(msg => App.app.telegram.deleteMessage(this.id, msg.message_id)).catch(() => {});
        this.statusMessage = null;
    }

    getSourcePath() {
        var source = this.getAudio()?.source;
        if (!source?.url) return;
        return Files.path("downloads", this.mode == "playlist" ? "youtube" : this.mode, this.mode == "telegram" ? source.url : Utility.getIdFromUrl(source.url));
    }

    getUserPath() {
        return Files.path("downloads", "users", this.id.toString());
    }

    getPosterPath() {
        return Files.path(this.getUserPath(), this.mode == "playlist" ? `poster${this.playlistId}.jpg` : "poster.jpg");
    }

    getInfo() {
        var audio = this.getAudio();
        var info = {};

        /** @type {string} */
        info.title = Utility.escapeCode(audio.title ?? audio.source.title);
        info.performer = Utility.escapeCode(audio.performer);
        info.duration = audio.source.duration;
        info.poster = audio.poster;
        info.start = audio.start;
        info.end = audio.end;

        info.text = "";
        if (this.mode == "playlist") info.text += `\`${this.playlistId+1}/${this.playlist.length}\`\n`;
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

import { App }  from "../main.js";
import { Utility } from "./utility.js";
import { Files } from "./files.js";
import { Menus } from "./menus.js";
import { Network } from "./network.js";


export class User {
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
            /** @type {PosterMode} */
            poster: null
        }
    }

    async parseLink() {
        this.status = "loading";

        var url = this.mode == "playlist" ? this.audio[this.playlistId] : this.audio;
        url = `https://www.youtube.com/watch?v=${Utility.getIdFromUrl(url)}`;
        var path = this.getSourcePath();
        var info, audio, poster;

        this.updateStatus(`Fetching: ${url}`);

        Files.createFolder(path);
        if (!Files.exists(Files.path(path, "data.json"))) {
            info = Network.fetchInfo(url).then(metadata => Files.saveAudio(path, {id: null, title: metadata.title, performer: metadata.channel, duration: metadata.duration || 0}));
        }
        if (!Files.exists(Files.path(path, "audio.m4a"))) {
            this.updateStatus(`Downloading: ${url}`);
            audio = Network.downloadMusic(url, path, true).then(() => this.updateStatus(`Fetching: ${url}`));
        }
        if (!Files.exists(Files.path(path, "poster.jpg"))) poster = Network.downloadPoster(url, path);

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
        var audioPath = Files.path(path, `${Utility.getFileName(title)}.m4a`);
        var duration = this.mode == "playlist" ? data.duration : Utility.getDuration(data.duration, this.settings.start, this.settings.end);

        this.status = "loading";
        this.updateStatus(`Uploading: ${title}`);
        App.app.telegram.deleteMessage(this.id, this.menu);
        this.menu = null;

        if (this.mode != "playlist" && (this.settings.start || this.settings.end)) await Files.cut(Files.path(sourcePath, "audio.m4a"), audioPath, this.settings.start, duration);
        else Files.copy(Files.path(sourcePath, "audio.m4a"), audioPath);

        await Network.uploadFile(this.id, audioPath, {title: title, performer: this.settings.performer, duration: duration, thumbnail: this.settings.poster && {source: Files.path(this.settings.poster == "default" ? sourcePath : path, "poster.jpg")}});

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
            var msg = await Network.uploadFile(this.id, Files.path(path, "audio.m4a"), {title: data.title, performer: data.performer, duration: data.duration, thumbnail: {source: Files.path(path, "poster.jpg")}});
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
                    poster = data.posterId ?? {source: Files.path(this.getSourcePath(), "poster.jpg")};
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
        return Files.path("downloads", this.mode == "playlist" ? "youtube" : this.mode, this.mode == "telegram" ? this.audio : Utility.getIdFromUrl(this.mode == "playlist" ? this.audio[this.playlistId] : this.audio));
    }

    getUserPath() {
        return Files.path("downloads", "users", this.id.toString());
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

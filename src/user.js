import { App }  from "../main.js";
import { Utility } from "./utility.js";
import { Files } from "./files.js";
import { AudioSettings } from "./audio.js";
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
        /** @type {number | null} */
        this.menu;
        /** @type {AudioSettings} */
        this.settings = new AudioSettings();
        /** @type {AudioSettings[]} */
        this.playlistSettings = [];
    }

    getSettings() {
        return this.mode == "playlist" ? this.playlistSettings[this.playlistId] : this.settings;
    }

    /**
     * @returns {Promise<boolean>}
     */
    async parseLink() {
        this.status = "loading";

        var url = this.mode == "playlist" ? this.audio[this.playlistId] : this.audio;
        url = `https://www.youtube.com/watch?v=${Utility.getIdFromUrl(url)}`;
        var path = this.getSourcePath();
        var info, audio, poster;

        this.updateStatus(`Fetching: ${url}`);

        try {
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
            this.getSettings().performer = Files.loadAudio(path).performer;
            this.clearStatus();
            await this.sendSource();
        }
        catch (error) {
            console.log(error);
            this.clearStatus();
            this.status = "none";
            App.app.telegram.sendMessage(this.id, `Failed to load: ${url}`).catch(() => {});
            return false;
        }
        return true;
    }

    async send() {
        if (this.status != "default") return;

        var sourcePath = this.getSourcePath();
        var data = Files.loadAudio(sourcePath);
        var settings = this.getSettings();
        var title = settings.title ?? data.title;
        var path = this.getUserPath();
        var audioPath = Files.path(path, `${Utility.getFileName(title)}.m4a`);
        var duration = Utility.getDuration(data.duration, settings.start, settings.end);

        this.status = "loading";
        this.updateStatus(`Uploading: ${title}`);
        if (this.menu) App.app.telegram.deleteMessage(this.id, this.menu).catch(() => {});
        this.menu = null;

        try {
            if (settings.start || settings.end) await Files.cut(Files.path(sourcePath, "audio.m4a"), audioPath, settings.start, duration);
            else Files.copy(Files.path(sourcePath, "audio.m4a"), audioPath);

            await Network.uploadFile(this.id, audioPath, {title: title, performer: settings.performer, duration: duration, thumbnail: settings.poster && {source: settings.poster == "default" ? Files.path(sourcePath, "poster.jpg") : this.getPosterPath()}});
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
        for (var _ of this.audio) {
            await this.send();
            this.playlistId += 1;
        }
        this.playlistId = last;
        await this.sendMenu();
    }

    /**
     * @param {"new" | "default" | "title" | "performer" | "poster" | "start" | "end"} mode
     */
    async sendMenu(mode) {
        if (this.status == "loading" || this.status == "none") return;
        if (!mode) mode = "new";

        var settings = this.getSettings();
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
        else if (mode == "title") App.app.telegram.editMessageText(this.id, this.menu, null, menuText, Menus.Cancel);
        else if (mode == "performer") App.app.telegram.editMessageText(this.id, this.menu, null, menuText, settings.performer ? (settings.performer == Files.loadAudio(this.getSourcePath()).performer ? Menus.RemoveOnly : Menus.DefaultNRemove) : Menus.DefaultOnly);
        else if (mode == "poster") {
            if (settings.poster) {
                App.app.telegram.deleteMessage(this.id, this.menu).catch(() => {});
                var poster = settings.posterId;
                var data;
                if (settings.poster == "default") {
                    data = Files.loadAudio(this.getSourcePath());
                    poster = data.posterId ?? {source: Files.path(this.getSourcePath(), "poster.jpg")};
                }
                var msg = await App.app.telegram.sendPhoto(this.id, poster, {...(settings.poster == "default" ? Menus.RemoveOnly : Menus.DefaultNRemove), caption: menuText});
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
                    App.app.telegram.deleteMessage(this.id, this.menu).catch(() => {});
                    var msg = await App.app.telegram.sendMessage(this.id, menuText, Menus.DefaultOnly);
                    this.menu = msg.message_id;
                }
            }
        }
        else if (mode == "start" || mode == "end") App.app.telegram.editMessageText(this.id, this.menu, null, menuText, Menus.DefaultOnly);
    }

    removeMenu() {
        if (!this.menu) return;
        App.app.telegram.deleteMessage(this.id, this.menu).catch(() => {});
    }

    /**
     * @param {"default"| {} & string | null} mode
     */
    setPoster(mode) {
        var settings = this.getSettings();
        if (!mode) settings.poster = null;
        else if (mode == "default") settings.poster = "default";
        else {
            settings.poster = "custom";
            settings.posterId = mode;
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
        this.statusMessage.then(msg => App.app.telegram.deleteMessage(this.id, msg.message_id)).catch(() => {});
        this.statusMessage = null;
    }

    getSourcePath() {
        if (!this.audio) return;
        return Files.path("downloads", this.mode == "playlist" ? "youtube" : this.mode, this.mode == "telegram" ? this.audio : Utility.getIdFromUrl(this.mode == "playlist" ? this.audio[this.playlistId] : this.audio));
    }

    getUserPath() {
        return Files.path("downloads", "users", this.id.toString());
    }

    getPosterPath() {
        return Files.path(this.getUserPath(), this.mode == "playlist" ? `poster${this.playlistId}.jpg` : "poster.jpg");
    }

    getInfo() {
        var data = Files.loadAudio(this.getSourcePath())
        var settings = this.getSettings();
        var info = {};

        /** @type {string} */
        info.title = Utility.escapeCode(settings.title ?? data.title);
        info.performer = Utility.escapeCode(settings.performer);
        info.duration = data.duration;
        info.poster = settings.poster;
        info.start = settings.start;
        info.end = settings.end;

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

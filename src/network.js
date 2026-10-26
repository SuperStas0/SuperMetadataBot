import { YtDlp } from "ytdlp-nodejs";
import dns from "node:dns";
import { Files } from "./files";
import { App } from "../main";

export class Network {
    static ytdlp = new YtDlp();

    static ffmpegStatus = this.ytdlp.ffmpegPath ? Promise.resolve() : this.ytdlp.downloadFFmpeg();

    static botFileLimit = 50 * 1024 * 1024;

    static posterFileLimit = 200 * 1024;

    static {
        dns.setDefaultResultOrder("ipv4first");
    }

    /**
     * @param {string} url
     * @param {string} path
     * @param {number} sizeLimit
     */
    static async downloadImage(url, path, sizeLimit) {
        var response = await fetch(url);
        if (!response.ok) return;
        var buffer = Buffer.from(await response.arrayBuffer());
        if (sizeLimit && sizeLimit < buffer.length) return;
        Files.write(path, buffer);
        return true;
    }

    /**
     * @param {string} url
     */
    static fetchInfo(url) {
        return this.ytdlp.getInfoAsync(url, {});
    }

    /**
     * @param {string} url
     * @param {string} path
     * @param {boolean | null} allowLarge
     */
    static downloadMusic(url, path, allowLarge) {
        var settings = {
            format: allowLarge ? { filter: "audioonly", type: "m4a", quality: "highest" } : "bestaudio[ext=m4a][filesize<50M]/bestaudio[filesize<50M]/worstaudio",
            output: Files.path(path, "audio.m4a"),
            noPlaylist: true
        }
        return this.ytdlp.downloadAsync(url, settings);
    }

    /**
     * @param {string} url
     * @param {string} path
     */
    static async downloadPoster(url, path) {
        for (let posterUrl of (await (this.ytdlp.getThumbnailsAsync(url))).reverse().map(el => el.url)) {
            if (!posterUrl.includes(".jpg") || posterUrl.includes(".webp")) continue;
            if (await this.downloadImage(posterUrl, Files.path(path, "poster.jpg"), this.posterFileLimit)) return Promise.resolve();
        }
    }

    /**
     * @param {number} chat
     * @param {string} path
     * @param {ExtraAudio} settings
     */
    static async uploadFile(chat, path, settings) {
        if (Files.getFileSize(path) < this.botFileLimit) {
            return await App.app.telegram.sendAudio(chat, {source: path}, settings);
        }
        else {
            var hash = Math.random().toString();

            if (settings?.thumbnail) settings.thumbnail = settings.thumbnail.source;

            var resolveFn;
            var filePromise = new Promise(resolve => { resolveFn = resolve; });
            App.largeFiles[hash] = resolveFn;
            var msg = (await App.data[chat].statusMessage).text;

            await App.userClient.connect();
            try {
                await App.userClient.sendFile(App.app.botInfo.username, {file: path, caption: hash, thumb: settings.thumbnail, progressCallback: progress => App.data[chat].updateStatus(`${msg}\n${(progress*100).toFixed(0)}%`), attributes: [new Api.DocumentAttributeAudio({duration: settings.duration, title: settings.title, performer: settings.performer})]});
            }
            finally {
                await App.userClient.disconnect();
            }
            var fileId = await filePromise;
            return await App.app.telegram.sendAudio(chat, fileId);
        }
    }
}

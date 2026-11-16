import { App } from "../main.js";
import { Files } from "./files.js";
import { YtDlp } from "ytdlp-nodejs";
import ffmpegStatic from "ffmpeg-static";
import dns from "node:dns";
import { Api } from "telegram";

export class Network {
    static ytdlp = new YtDlp({ffmpegPath: ffmpegStatic});

    static botFileLimit = 50 * 1024 * 1024;

    static posterFileLimit = 200 * 1024;

    static largeQueue = Promise.resolve();

    static maxDuration = 4 * 60 * 60;

    static maxDownloads = 3;

    static minFreeSpace = 1024 * 1024 * 1024;

    static infoTimeout = 90 * 1000;

    static downloadTimeout = 30 * 60 * 1000;

    static {
        dns.setDefaultResultOrder("ipv4first");
    }

    /**
     * @param {string} url
     * @param {string} path
     * @param {number} sizeLimit
     */
    static async downloadImage(url, path, sizeLimit) {
        var response = await fetch(url, {signal: AbortSignal.timeout(15 * 1000)});
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
        for (var posterUrl of (await (this.ytdlp.getThumbnailsAsync(url))).reverse().map(el => el.url)) {
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
            var upload = this.largeQueue.then(() => this.uploadLarge(chat, path, settings));
            this.largeQueue = upload.catch(() => {});
            return await upload;
        }
    }

    /**
     * @param {number} chat
     * @param {string} path
     * @param {ExtraAudio} settings
     */
    static async uploadLarge(chat, path, settings) {
        var hash = Math.random().toString();

        if (settings?.thumbnail) settings.thumbnail = settings.thumbnail.source;

        var resolveFn;
        var filePromise = new Promise(resolve => { resolveFn = resolve; });
        var timer;
        var shown = -5;
        App.largeFiles[hash] = resolveFn;

        try {
            var msg = (await App.data[chat].statusMessage).text;

            await App.userClient.connect();
            try {
                await App.userClient.sendFile(App.app.botInfo.username, {file: path, caption: hash, thumb: settings.thumbnail, progressCallback: progress => { if (progress * 100 < shown + 5) return; shown = Math.floor(progress * 100); App.data[chat].updateStatus(`${msg}\n${shown}%`); }, attributes: [new Api.DocumentAttributeAudio({duration: settings.duration, title: settings.title, performer: settings.performer})]});
            }
            finally {
                await App.userClient.disconnect();
            }
            var fileId = await Promise.race([filePromise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("Large file was not received by the bot, check that the user client account is the admin")), 60 * 1000); })]);
        }
        finally {
            clearTimeout(timer);
            delete App.largeFiles[hash];
        }
        return await App.app.telegram.sendAudio(chat, fileId);
    }
}

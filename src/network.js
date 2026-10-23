import { YtDlp } from "ytdlp-nodejs";
import dns from "node:dns";

export class Network {
    static ytdlp = new YtDlp();
    static ffmpeg = this.ytdlp.ffmpegPath ? Promise.resolve() : this.ytdlp.downloadFFmpeg();

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
            output: join(path, "audio.m4a"),
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
            if (await this.downloadImage(posterUrl, join(path, "poster.jpg"), 200*1024)) return Promise.resolve();
        }
    }

    /**
     * @param {number} chat
     * @param {string} path
     * @param {ExtraAudio} settings
     */
    static async uploadFile(chat, path, settings) {
        if (Files.getFileSize(path) < 50 * 1024 * 1024) {
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

    /**
     * @param {Context} ctx
     * @returns {string[]}
     */
    static getUrls(ctx) {
        if (!ctx.message.entities) return [];
        return ctx.message.entities.filter(entity => entity.type == "url").map(entity => ctx.message.text.slice(entity.offset, entity.offset + entity.length));
    }

    /**
     * @param {string} url
     */
    static getIdFromUrl(url) {
        if (url.includes("watch?v=")) return url.split("?")[1].split("&")[0].replaceAll("v=","");
        else if (url.includes("youtu.be")) return url.split("?")[0].split("/").toReversed()[0];
        else return url;
    }
}

import { App } from "../main.js";
import { Files } from "./files.js";
import { YtDlp } from "ytdlp-nodejs";
import ffmpegStatic from "ffmpeg-static";
import dns from "node:dns";
import { TelegramClient, Api } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Logger } from "telegram/extensions/index.js";

export class Network {
    static ytdlp = new YtDlp({ffmpegPath: ffmpegStatic});

    /** @type {TelegramClient | null} */
    static userClient = null;

    static userClientTimer = null;

    static userClientIdle = 5 * 60 * 1000;

    static botFileLimit = 50 * 1024 * 1024;

    static posterFileLimit = 200 * 1024;

    static cookiesFileLimit = 2 * 1024 * 1024;

    static largeQueue = Promise.resolve();

    static maxDuration = 4 * 60 * 60;

    static maxDownloads = 3;

    static minFreeSpace = 1024 * 1024 * 1024;

    static infoTimeout = 90 * 1000;

    static playlistTimeout = 5 * 60 * 1000;

    static downloadTimeout = 30 * 60 * 1000;

    static sponsorBlockUrl = "https://sponsor.ajay.app";

    static segmentCategories = ["sponsor", "selfpromo", "interaction", "intro", "outro", "preview", "music_offtopic", "filler"];

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
     * @param {number} sizeLimit
     * @returns {Promise<Buffer | null>}
     */
    static async downloadFile(url, sizeLimit) {
        var response = await fetch(url, {signal: AbortSignal.timeout(15 * 1000)});
        if (!response.ok) return null;
        var buffer = Buffer.from(await response.arrayBuffer());
        return buffer.length <= sizeLimit ? buffer : null;
    }

    /**
     * @param {any} error
     */
    static needsCookies(error) {
        return /not a bot|confirm your age|age-restricted|inappropriate|age_verification_required|age_check_required/i.test(error?.message ?? "");
    }

    /**
     * @param {string | null} source
     * @param {(cookies?: string) => Promise<any>} task
     */
    static async withCookies(source, task) {
        if (!source) return await task();
        var copy = Files.path("downloads", `cookies-${Math.random().toString(36).slice(2)}.txt`);
        Files.createFolder("downloads");
        Files.copy(source, copy);
        try {
            return await task(copy);
        }
        finally {
            Files.tryDelete(copy);
        }
    }

    /**
     * @param {string} url
     * @param {string | null} [cookies]
     */
    static fetchInfo(url, cookies) {
        return this.withCookies(cookies, copy => this.ytdlp.getInfoAsync(url, {cookies: copy}));
    }

    /**
     * @param {string} url
     * @param {string | null} [cookies]
     */
    static async fetchPlaylist(url, cookies) {
        var info = await this.fetchInfo(url, cookies);
        return {title: info.title, ids: (info.entries ?? []).map(entry => entry?.id).filter(id => /^[A-Za-z0-9_-]{11}$/.test(id))};
    }

    /**
     * @param {string} id
     * @param {number} duration
     * @returns {Promise<Segment[]>}
     */
    static async fetchSegments(id, duration) {
        var query = new URLSearchParams({videoID: id, categories: JSON.stringify(this.segmentCategories), actionTypes: JSON.stringify(["skip"])});
        var response = await fetch(`${this.sponsorBlockUrl}/api/skipSegments?${query}`, {signal: AbortSignal.timeout(10 * 1000)});
        if (response.status == 404) return [];
        if (!response.ok) throw new Error(`SponsorBlock responded with ${response.status}`);
        var segments = [];
        for (var item of await response.json()) {
            if (!Array.isArray(item.segment) || !this.segmentCategories.includes(item.category) || (item.votes ?? 0) < 0) continue;
            if (item.videoDuration && Math.abs(item.videoDuration - duration) > 2) continue;
            if (item.segment[1] - item.segment[0] < 1) continue;
            var start = Math.max(0, Math.round(item.segment[0]));
            var end = Math.min(duration, Math.round(item.segment[1]));
            if (end - start >= 1) segments.push({start: start, end: end, category: item.category});
        }
        return segments.sort((first, second) => first.start - second.start);
    }

    /**
     * @param {string} url
     * @param {string} path
     * @param {boolean | null} allowLarge
     * @param {string | null} [cookies]
     */
    static downloadMusic(url, path, allowLarge, cookies) {
        var settings = {
            format: allowLarge ? { filter: "audioonly", type: "m4a", quality: "highest" } : "bestaudio[ext=m4a][filesize<50M]/bestaudio[filesize<50M]/worstaudio",
            output: Files.path(path, allowLarge ? "audio.m4a" : "audio-limited.m4a"),
            noPlaylist: true
        }
        return this.withCookies(cookies, copy => this.ytdlp.downloadAsync(url, {...settings, cookies: copy}));
    }

    /**
     * @param {string} url
     * @param {string} path
     * @param {string | null} [cookies]
     */
    static async downloadPoster(url, path, cookies) {
        for (var posterUrl of (await this.fetchInfo(url, cookies)).thumbnails.reverse().map(el => el.url)) {
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

            await this.withUserClient(client => {
                shown = -5;
                return client.sendFile(App.app.botInfo.username, {file: path, caption: hash, thumb: settings.thumbnail, progressCallback: progress => { if (progress * 100 < shown + 5) return; shown = Math.floor(progress * 100); App.data[chat].updateStatus(`${msg}\n${shown}%`); }, attributes: [new Api.DocumentAttributeAudio({duration: settings.duration, title: settings.title, performer: settings.performer})]});
            })
            var fileId = await Promise.race([filePromise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("Large file was not received by the bot, check that the user client account is the admin")), 60 * 1000); })]);
        }
        finally {
            clearTimeout(timer);
            delete App.largeFiles[hash];
        }
        return await App.app.telegram.sendAudio(chat, fileId);
    }

    static async getUserClient() {
        clearTimeout(this.userClientTimer);
        if (!this.userClient) {
            this.userClient = new TelegramClient(new StringSession(Files.config.sessionId), Files.config.apiId, Files.config.apiHash, {connectionRetries: 5, baseLogger: new Logger("error")});
        }
        if (!this.userClient.connected) await this.userClient.connect();
        return this.userClient;
    }

    static async dropUserClient() {
        clearTimeout(this.userClientTimer);
        var client = this.userClient;
        this.userClient = null;
        if (client) await client.destroy().catch(() => {});
    }

    /**
     * @param {(client: TelegramClient) => Promise<any>} task
     */
    static async withUserClient(task) {
        try {
            for (var attempt = 1; ; attempt++) {
                try {
                    return await task(await this.getUserClient());
                }
                catch (error) {
                    await this.dropUserClient();
                    if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED/.test(error.errorMessage ?? "")) throw new Error("User client session is no longer valid, run the build script with -s to log in again");
                    if (attempt >= 2) throw error;
                    console.log(error);
                }
            }
        }
        finally {
            this.userClientTimer = setTimeout(() => this.dropUserClient(), this.userClientIdle);
            this.userClientTimer.unref();
        }
    }
}

import { App } from "../main.js";
import { Files } from "./files.js";
import { Log } from "./log.js";
import { Utility } from "./utility.js";
import { YtDlp } from "ytdlp-nodejs";
import ffmpegStatic from "ffmpeg-static";
import dns from "node:dns";
import fs from "node:fs";
import { basename } from "node:path";
import { pipeline, Transform } from "node:stream";
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

    static cookieCheckId = "jNQXAC9IbQ0";

    static largeQueue = Promise.resolve();

    static maxDuration = 4 * 60 * 60;

    static maxDownloads = 3;

    static minFreeSpace = 1024 * 1024 * 1024;

    static infoTimeout = 90 * 1000;

    static playlistTimeout = 5 * 60 * 1000;

    static downloadTimeout = 30 * 60 * 1000;

    static telegramFileLimit = 20 * 1024 * 1024;

    static fileTimeout = 5 * 60 * 1000;

    static searchCount = 5;

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
     * @param {number} [timeout]
     * @param {(fraction: number) => void} [onProgress]
     * @param {AbortSignal} [signal]
     * @returns {Promise<Buffer | null>}
     */
    static async downloadFile(url, sizeLimit, timeout = 15 * 1000, onProgress, signal) {
        var response = await fetch(url, {signal: AbortSignal.any(signal ? [AbortSignal.timeout(timeout), signal] : [AbortSignal.timeout(timeout)])});
        if (!response.ok) return null;
        var total = Number(response.headers.get("content-length")) || 0;
        if (total > sizeLimit) return null;
        var chunks = [];
        var received = 0;
        for await (var chunk of response.body) {
            received += chunk.length;
            if (received > sizeLimit) return null;
            chunks.push(chunk);
            if (total) onProgress?.(received / total);
        }
        return Buffer.concat(chunks);
    }

    /**
     * @param {any} error
     */
    static needsCookies(error) {
        return this.cookieProblem(error) != null;
    }

    /**
     * @param {any} error
     * @returns {"format" | "age" | "bot" | null} what YouTube complains about when cookies could help
     */
    static cookieProblem(error) {
        var message = error?.message ?? "";
        if (/requested format is not available/i.test(message)) return "format";
        if (/confirm your age|age-restricted|inappropriate|age_verification_required|age_check_required/i.test(message)) return "age";
        if (/not a bot/i.test(message)) return "bot";
        return null;
    }

    /**
     * @param {any} error
     * @returns {string | null} the reason YouTube gives when the video itself cannot be loaded
     */
    static unavailableReason(error) {
        var message = (error?.message ?? "").replace(/^yt-dlp exited with code \d+:\s*/, "").replace(/^[A-Za-z0-9_-]{11}:\s*/, "").trim();
        return /^(video unavailable|private video|this video (is|has been|was)|the uploader has not made this video available|this live event)/i.test(message) ? message.split("\n")[0] : null;
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
     * @param {string} source cookies file to check
     * @returns {Promise<"valid" | "rotated" | "rejected">} rotated: YouTube signed the account out, rejected: YouTube still blocks the request
     */
    static async checkCookies(source) {
        return await this.withCookies(source, async copy => {
            try {
                var result = await this.ytdlp.exec(`https://www.youtube.com/watch?v=${this.cookieCheckId}`, {dumpSingleJson: true, noPlaylist: true, ignoreNoFormatsError: true, cookies: copy}).run();
            }
            catch (error) {
                if (this.needsCookies(error)) return "rejected";
                throw error;
            }
            if (JSON.parse(result.output).id != this.cookieCheckId) throw new Error("Cookie check returned no video info");
            return /cookies are no longer valid/i.test(result.stderr) ? "rotated" : "valid";
        });
    }

    /**
     * @param {string} url
     * @returns {Promise<string>} the formats yt-dlp sees, for the error log
     */
    static async describeFormats(url) {
        try {
            var version = await this.ytdlp.getVersionAsync();
            var result = await Utility.timeout(this.ytdlp.exec(url, {dumpSingleJson: true, ignoreNoFormatsError: true}).run(), this.infoTimeout, "Reading formats timed out");
            var info = JSON.parse(result.output);
            var formats = info.formats ?? [];
            var lines = formats.slice(0, 40).map(format => `${format.format_id} ${format.ext} a:${format.acodec} v:${format.vcodec} ${format.filesize ?? format.filesize_approx ?? "?"} ${format.format_note ?? ""}`);
            var warnings = result.stderr.split(/\r?\n/).filter(line => /^(WARNING|ERROR)/.test(line)).slice(-8);
            return `yt-dlp ${version}, formats (${formats.length}), availability ${info.availability}, live ${info.live_status}:\n${[...lines, ...warnings].join("\n")}`;
        }
        catch (error) {
            return `Formats unavailable: ${error.message}`;
        }
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
     * @param {string} query
     * @param {string | null} [cookies]
     * @returns {Promise<SearchResult[]>}
     */
    static async fetchSearch(query, cookies) {
        var info = await this.fetchInfo(`ytsearch${this.searchCount}:${query}`, cookies);
        return (info.entries ?? []).filter(entry => /^[A-Za-z0-9_-]{11}$/.test(entry?.id)).map(entry => ({id: entry.id, title: entry.title ?? "", channel: entry.channel ?? entry.uploader ?? "", views: entry.view_count ?? null, duration: entry.duration ?? null})).sort((first, second) => (second.views ?? -1) - (first.views ?? -1));
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
     * @param {(fraction: number) => void} [onProgress]
     * @param {AbortSignal} [signal]
     */
    static async downloadMusic(url, path, allowLarge, cookies, onProgress, signal) {
        signal?.throwIfAborted();
        var settings = {
            format: allowLarge ? "bestaudio/ba*/best" : "bestaudio[ext=m4a][filesize<50M]/bestaudio[filesize<50M]/bestaudio[filesize_approx<50M]/ba*[filesize<50M]/ba*[filesize_approx<50M]/worstaudio/wa*/worst",
            extractAudio: true,
            audioFormat: "m4a",
            output: Files.path(path, allowLarge ? "audio.%(ext)s" : "audio-limited.%(ext)s"),
            noPlaylist: true
        }
        return await this.withCookies(cookies, async copy => {
            var warnings = [];
            var download = this.ytdlp.download(url, {...settings, cookies: copy});
            download.on("stderr", text => warnings.push(...text.split(/\r?\n/).filter(line => /^(WARNING|ERROR)/.test(line))));
            if (onProgress) download.on("progress", progress => onProgress(progress.status == "finished" ? 1 : progress.total ? progress.downloaded / progress.total : NaN));
            signal?.addEventListener("abort", () => download.kill(), {once: true});
            try {
                return await download.run();
            }
            catch (error) {
                error.stack += `\n${warnings.slice(-8).join("\n")}`;
                throw error;
            }
        });
    }

    /**
     * @param {string} url
     * @param {string} path
     * @param {string | null} [cookies]
     * @param {{url: string}[]} [thumbnails] from the already fetched info
     */
    static async downloadPoster(url, path, cookies, thumbnails) {
        for (var posterUrl of (thumbnails ?? (await this.fetchInfo(url, cookies)).thumbnails ?? []).toReversed().map(el => el.url)) {
            if (!posterUrl?.includes(".jpg") || posterUrl.includes(".webp")) continue;
            if (await this.downloadImage(posterUrl, Files.path(path, "poster.jpg"), this.posterFileLimit)) return Promise.resolve();
        }
    }

    /**
     * @param {number} chat
     * @param {string} path
     * @param {ExtraAudio} settings
     * @param {(fraction: number) => void} [onProgress]
     * @param {AbortSignal} [signal]
     */
    static async uploadFile(chat, path, settings, onProgress, signal) {
        signal?.throwIfAborted();
        var size = Files.getFileSize(path);
        if (size >= this.botFileLimit) {
            var upload = this.largeQueue.then(() => this.uploadLarge(chat, path, settings, onProgress, signal));
            this.largeQueue = upload.catch(() => {});
            return await Utility.abortable(upload, signal);
        }
        var sent = 0;
        var counter = new Transform({transform: (chunk, encoding, done) => {
            sent += chunk.length;
            onProgress?.(sent / size);
            done(null, chunk);
        }});
        var source = pipeline(fs.createReadStream(path), counter, () => {});
        try {
            return await App.app.telegram.callApi("sendAudio", {chat_id: chat, audio: {source: source, filename: basename(path)}, ...settings}, {signal: signal});
        }
        finally {
            source.destroy();
        }
    }

    /**
     * @param {number} chat
     * @param {string} path
     * @param {ExtraAudio} settings
     * @param {(fraction: number) => void} [onProgress]
     * @param {AbortSignal} [signal]
     */
    static async uploadLarge(chat, path, settings, onProgress, signal) {
        signal?.throwIfAborted();
        var hash = Math.random().toString();

        if (settings?.thumbnail) settings.thumbnail = settings.thumbnail.source;

        var resolveFn;
        var filePromise = new Promise(resolve => { resolveFn = resolve; });
        var timer;
        var progress = fraction => onProgress?.(fraction);
        signal?.addEventListener("abort", () => { progress.isCanceled = true; }, {once: true});
        App.largeFiles[hash] = resolveFn;

        try {
            await this.withUserClient(client => client.sendFile(App.app.botInfo.username, {file: path, caption: hash, thumb: settings.thumbnail, progressCallback: progress, attributes: [new Api.DocumentAttributeAudio({duration: settings.duration, title: settings.title, performer: settings.performer})]}));
            var fileId = await Utility.abortable(Promise.race([filePromise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error("Large file was not received by the bot, check that the user client account is the admin")), 60 * 1000); })]), signal);
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
                    if (error.message == "USER_CANCELED") throw error;
                    await this.dropUserClient();
                    if (/AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|USER_DEACTIVATED/.test(error.errorMessage ?? "")) throw new Error("User client session is no longer valid, run the build script with -s to log in again");
                    if (attempt >= 2) throw error;
                    Log.error("User client", error);
                }
            }
        }
        finally {
            this.userClientTimer = setTimeout(() => this.dropUserClient(), this.userClientIdle);
            this.userClientTimer.unref();
        }
    }
}

import fs from "node:fs";
import { PassThrough } from "node:stream";
import { join, resolve as resolvePath } from "path";
import ffmpeg from "fluent-ffmpeg";
import { AudioSource } from "./audio.js";
import { Utility } from "./utility.js";
import { Log } from "./log.js";

export class Files {
    /** @type {ConfigFile} */
    static config = this.load("static", "config.json");

    static {
        var missing = ["botToken", "admin", "apiId", "apiHash"].filter(key => !this.config[key]);
        if (missing.length) throw new Error(`static\\config.json is missing: ${missing.join(", ")}`);
    }

    /** @type {{access?: "public" | "confirm" | "private", shareCookies?: "on" | "confirm" | "off", searchConfirm?: "on" | "nonadmin" | "off", largeFiles?: "on" | "confirm" | "off", allowed?: number[], cleared?: number[]}} */
    static settings = this.migrate(this.exists("static", "settings.json") ? this.load("static", "settings.json") : {});

    static defaults = {access: "private", shareCookies: "off", searchConfirm: "off", largeFiles: "off"};

    static posterSizeLimit = 200 * 1024;

    static posterSize = 320;

    static posterBlackLevel = 24;

    static silenceNoise = "-60dB";

    static silenceDuration = 2;

    /** @type {string} */
    static startText = Utility.escapeMarkdown(this.read("static", "start.md"));

    /** @type {string} */
    static helpText = Utility.escapeMarkdown(this.read("static", "help.md"));

    /** @type {string} */
    static cookiesText = Utility.escapeMarkdown(this.read("static", "cookies.md"));

    /**
     * @overload
     * @param {string} path
     * @return {string}
     * @overload
     * @param {string[]} path
     * @return {string}
     */
    static read(...path) {
        return fs.readFileSync(this.path(...path), "utf8");
    }

    /**
     * @param {string} path
     * @param {string | Buffer} data
     * @param {number} [mode]
     */
    static write(path, data, mode) {
        fs.writeFileSync(path, data, mode ? {mode: mode} : undefined);
    }

    /**
     * @overload
     * @param {string} path
     * @overload
     * @param {string[]} path
     */
    static load(...path) {
        return JSON.parse(this.read(...path));
    }

    /**
     * @param {string} path
     * @param {any} data
     */
    static save(path, data) {
        this.write(path, JSON.stringify(data, null, 0));
    }

    /**
     * @param {any} settings
     */
    static migrate(settings) {
        if (settings.locked != null) settings.access ??= settings.locked ? "private" : "public";
        delete settings.locked;
        if (typeof settings.shareCookies == "boolean") settings.shareCookies = settings.shareCookies ? "on" : "off";
        return settings;
    }

    /**
     * @param {"access" | "shareCookies" | "searchConfirm" | "largeFiles"} name
     * @returns {string}
     */
    static getSetting(name) {
        return this.settings[name] ?? this.defaults[name];
    }

    static saveSettings() {
        var path = this.path("static", "settings.json");
        this.write(`${path}.tmp`, JSON.stringify(this.settings, null, 4));
        this.move(`${path}.tmp`, path);
    }

    /**
     * @param {string} path
     * @return {AudioSource}
     */
    static loadAudio(path) {
        return Object.assign(new AudioSource(), this.load(this.path(path, "data.json")), {path: path});
    }

    /**
     * @param {string} path
     * @param {AudioSource} data
     */
    static saveAudio(path, data) {
        var file = this.path(path, "data.json");
        var silences = data.silences ?? (this.exists(file) ? this.load(file).silences : null) ?? null;
        this.save(file, {id: data.id, posterId: data.posterId, title: data.title, performer: data.performer, duration: data.duration, limited: data.limited, silences: silences});
    }

    /**
     * @overload
     * @param {string} path
     * @overload
     * @param {string[]} path
     */
    static exists(...path) {
        return fs.existsSync(this.path(...path));
    }

    static getFreeSpace() {
        var stats = fs.statfsSync(this.exists("downloads") ? "downloads" : ".");
        return stats.bavail * stats.bsize;
    }

    /**
     * @param {string} path
     */
    static list(path) {
        return this.exists(path) ? fs.readdirSync(path) : [];
    }

    /**
     * @param {string} path
     */
    static touch(path) {
        if (!this.exists(path)) return;
        var now = new Date();
        fs.utimesSync(path, now, now);
    }

    /**
     * @param {string} path
     */
    static createFolder(path) {
        if (!this.exists(path)) fs.mkdirSync(path, {force: true, recursive: true});
    }

    /**
     * @param {string} path
     */
    static delete(path) {
        if (this.exists(path)) fs.rmSync(path, {force: true, recursive: true});
    }

    /**
     * @param {string} path
     */
    static getFileSize(path) {
        return fs.statSync(path).size;
    }

    /**
     * @param {string} inputPath
     * @param {string} outputPath
     */
    static copy(inputPath, outputPath) {
        fs.copyFileSync(inputPath, outputPath);
    }

    /**
     * @param {string} inputPath
     * @param {string} outputPath
     */
    static move(inputPath, outputPath) {
        fs.renameSync(inputPath, outputPath);
    }

    /**
     * @param {string} path
     */
    static setFfmpegPath(path) {
        return ffmpeg.setFfmpegPath(path);
    }

    /**
     * @overload
     * @param {string} path
     * @overload
     * @param {string[]} path
     */
    static path(...path) {
        return join(...path);
    }

    static cleanTemp() {
        for (var name of this.list("downloads")) {
            if (/^cookies-.*\.txt$/.test(name)) this.tryDelete(this.path("downloads", name));
        }
        for (var id of this.list(this.path("downloads", "telegram"))) {
            for (var name of this.list(this.path("downloads", "telegram", id))) {
                if (/^(original\..*|tmp-audio\.m4a)$/.test(name)) this.tryDelete(this.path("downloads", "telegram", id, name));
            }
        }
        for (var user of this.list(this.path("downloads", "users"))) {
            for (var name of this.list(this.path("downloads", "users", user))) {
                if (name.endsWith(".m4a") || name.endsWith(".m4a.txt") || name == "cookies.txt.tmp") this.delete(this.path("downloads", "users", user, name));
            }
        }
    }

    /**
     * @param {string} path
     */
    static tryDelete(path) {
        try {
            this.delete(path);
        }
        catch (error) {
            Log.error(`Delete ${path}`, error);
        }
    }

    /**
     * @param {number} maxAge
     * @param {number} maxFolderAge
     * @param {number} maxSize
     */
    static cleanCache(maxAge, maxFolderAge, maxSize) {
        var now = Date.now();
        var audios = [];
        var folders = [];
        for (var source of ["youtube", "telegram"]) {
            for (var id of this.list(this.path("downloads", source))) folders.push(this.path("downloads", source, id));
        }
        for (var folder of folders) {
            for (var name of this.list(folder)) {
                var path = this.path(folder, name);
                if (!/^audio(-limited)?\./.test(name)) continue;
                var stats = fs.statSync(path);
                if (now - stats.mtimeMs > maxAge) this.tryDelete(path);
                else if (name.endsWith(".m4a")) audios.push({path: path, size: stats.size, time: stats.mtimeMs});
            }
            var dataPath = this.path(folder, "data.json");
            if (!this.list(folder).some(name => name.endsWith(".m4a")) && now - fs.statSync(this.exists(dataPath) ? dataPath : folder).mtimeMs > maxFolderAge) this.tryDelete(folder);
        }

        var total = audios.reduce((sum, audio) => sum + audio.size, 0);
        for (var audio of audios.sort((first, second) => first.time - second.time)) {
            if (total <= maxSize) break;
            this.tryDelete(audio.path);
            total -= audio.size;
        }

        for (var user of this.list(this.path("downloads", "users"))) {
            for (var name of this.list(this.path("downloads", "users", user))) {
                var path = this.path("downloads", "users", user, name);
                if (/^poster(\d*|-batch)(-square|-formatted)?\.jpg$/.test(name) && now - fs.statSync(path).mtimeMs > maxAge) this.tryDelete(path);
            }
        }
    }

    static getStorage() {
        var groups = ["YouTube audio", "YouTube posters and info", "Uploaded audio", "Uploaded posters and info", "User posters", "Cookies", "User temporary files", "Other"].map(name => ({name: name, size: 0, count: 0, audio: name.endsWith("audio")}));
        var add = (name, size) => {
            var group = groups.find(group => group.name == name);
            group.size += size;
            group.count++;
        }
        var classify = (parts, name) => {
            var audio = /^audio.*\.m4a$/.test(name);
            if (parts[0] == "youtube") return audio ? "YouTube audio" : "YouTube posters and info";
            if (parts[0] == "telegram") return audio ? "Uploaded audio" : "Uploaded posters and info";
            if (parts[0] == "users" && parts.length > 1) return /^poster/.test(name) ? "User posters" : /^cookies\.txt$/.test(name) ? "Cookies" : "User temporary files";
            return "Other";
        }
        var walk = (path, parts) => {
            for (var entry of fs.readdirSync(path, {withFileTypes: true})) {
                var full = join(path, entry.name);
                try {
                    if (entry.isDirectory()) walk(full, [...parts, entry.name]);
                    else if (entry.isFile()) add(classify(parts, entry.name), fs.statSync(full).size);
                }
                catch (error) {
                    if (error.code != "ENOENT") throw error;
                }
            }
        }
        if (this.exists("downloads")) walk("downloads", []);
        return groups;
    }

    /**
     * @param {string} inputPath
     * @param {string} outputPath
     * @param {[number, number | null][]} parts
     * @param {AbortSignal} [signal]
     */
    static async cut(inputPath, outputPath, parts, signal) {
        if (parts.length == 1) {
            var [start, end] = parts[0];
            var command = ffmpeg(inputPath).setStartTime(start);
            if (end != null) command.setDuration(end - start);
            return await this.runFfmpeg(command.audioCodec("copy"), outputPath, signal);
        }
        var listPath = `${outputPath}.txt`;
        var source = resolvePath(inputPath).replaceAll("\\", "/").replaceAll("'", "'\\''");
        var lines = parts.flatMap(([start, end]) => [`file '${source}'`, `inpoint ${start}`, ...(end == null ? [] : [`outpoint ${end}`])]);
        this.write(listPath, `${lines.join("\n")}\n`);
        try {
            await this.runFfmpeg(ffmpeg(listPath).inputOptions("-f", "concat", "-safe", "0").audioCodec("copy"), outputPath, signal);
        }
        finally {
            this.tryDelete(listPath);
        }
    }

    /**
     * @param {string} inputPath
     * @param {string} outputPath
     * @param {boolean} copy
     * @param {AbortSignal} [signal]
     * @param {(fraction: number) => void} [onProgress]
     * @returns {Promise<number>} duration in seconds
     */
    static async importAudio(inputPath, outputPath, copy, signal, onProgress) {
        var duration = 0;
        var command = ffmpeg(inputPath).on("codecData", data => { duration = Utility.parseClock(data.duration); }).outputOptions("-map", "0:a:0", "-map_metadata", "-1");
        if (copy) command.audioCodec("copy");
        else command.audioCodec("aac").audioBitrate("192k");
        await this.runFfmpeg(command, outputPath, signal, onProgress);
        return Math.round(duration);
    }

    /**
     * @param {import("fluent-ffmpeg").FfmpegCommand} command
     * @param {string} outputPath
     * @param {AbortSignal} [signal]
     * @param {(fraction: number) => void} [onProgress]
     */
    static runFfmpeg(command, outputPath, signal, onProgress) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) return reject(signal.reason);
            signal?.addEventListener("abort", () => command.kill("SIGKILL"), {once: true});
            if (onProgress) {
                var total = 0;
                command.on("codecData", data => { total = Utility.parseClock(data.duration); });
                command.on("progress", progress => total && onProgress(Utility.parseClock(progress.timemark) / total));
            }
            command.on("end", resolve).on("error", reject).save(outputPath);
        })
    }

    /**
     * @param {string} inputPath
     * @param {string} outputPath
     */
    static async extractCover(inputPath, outputPath) {
        try {
            await new Promise((resolve, reject) => ffmpeg(inputPath).videoFilters("scale=320:320:force_original_aspect_ratio=decrease", "format=yuvj420p").outputOptions("-map", "0:v:0", "-frames:v", "1", "-q:v", "3").on("end", resolve).on("error", reject).save(outputPath));
        }
        catch (error) {
            this.tryDelete(outputPath);
            throw error;
        }
    }

    /**
     * Removes black edges equally from both sides, scales the image to fill a square from the center and resizes it to the Telegram thumbnail limits
     * @param {string} inputPath
     * @param {string} outputPath
     */
    static async formatPoster(inputPath, outputPath) {
        var temp = outputPath.replace(/\.jpg$/, ".tmp.jpg");
        var margins = await this.detectBlackMargins(inputPath);
        var size = this.posterSize;
        var filters = [`scale=${size}:${size}:force_original_aspect_ratio=increase`, `crop=${size}:${size}`, "setsar=1", "format=yuvj420p"];
        if (margins) filters.unshift(`crop=iw-${margins[0] * 2}:ih-${margins[1] * 2}:${margins[0]}:${margins[1]}`);
        try {
            for (var quality of [3, 8, 15]) {
                await new Promise((resolve, reject) => ffmpeg(inputPath).videoFilters(filters).outputOptions("-frames:v", "1", "-q:v", String(quality)).on("end", resolve).on("error", reject).save(temp));
                if (this.getFileSize(temp) <= this.posterSizeLimit) break;
            }
        }
        catch (error) {
            this.tryDelete(temp);
            throw error;
        }
        this.move(temp, outputPath);
    }

    /**
     * @param {string} inputPath
     * @returns {Promise<[number, number] | null>} black margin to cut from the left and the right, and from the top and the bottom, the smaller one of each pair, null if nothing to trim
     */
    static async detectBlackMargins(inputPath) {
        var size = null;
        var chunks = [];
        var stream = new PassThrough();
        stream.on("data", chunk => chunks.push(chunk));
        var command = ffmpeg(inputPath).videoFilters("format=gray").outputOptions("-frames:v", "1").format("rawvideo");
        command.on("stderr", line => {
            size = line.match(/Video:.*?(\d{2,5})x(\d{2,5})/)?.slice(1).map(Number) ?? size;
        });
        try {
            await new Promise((resolve, reject) => command.on("end", resolve).on("error", reject).pipe(stream));
        }
        catch {
            return null;
        }
        var pixels = Buffer.concat(chunks);
        if (!size || pixels.length != size[0] * size[1]) return null;

        var [width, height] = size;
        var level = this.posterBlackLevel;
        var rowBlack = y => pixels.subarray(y * width, (y + 1) * width).every(value => value <= level);
        var columnBlack = x => {
            for (var y = 0; y < height; y++) if (pixels[y * width + x] > level) return false;
            return true;
        };

        var top = 0;
        while (top < height && rowBlack(top)) top++;
        if (top == height) return null;
        var bottom = 0;
        while (rowBlack(height - 1 - bottom)) bottom++;
        var left = 0;
        while (columnBlack(left)) left++;
        var right = 0;
        while (columnBlack(width - 1 - right)) right++;

        var horizontal = Math.min(left, right);
        var vertical = Math.min(top, bottom);
        if (!horizontal && !vertical) return null;
        if ((width - horizontal * 2) * (height - vertical * 2) < width * height * 0.2) return null;
        return [horizontal, vertical];
    }

    /**
     * @param {string} inputPath
     * @returns {Promise<Segment[]>}
     */
    static async detectSilence(inputPath) {
        var silences = [];
        var start = null;
        var duration = 0;
        var command = ffmpeg(inputPath).noVideo().audioFilters(`silencedetect=noise=${this.silenceNoise}:d=${this.silenceDuration}`).format("null");
        command.on("stderr", line => {
            var total = line.match(/Duration: (\d+:\d+:[\d.]+)/)?.[1];
            if (total) duration = Utility.parseClock(total);
            var begin = line.match(/silence_start: (-?[\d.]+)/)?.[1];
            if (begin) start = Math.max(0, Number(begin));
            var end = line.match(/silence_end: ([\d.]+)/)?.[1];
            if (end && start != null) {
                silences.push({start: start, end: Number(end), category: "silence"});
                start = null;
            }
        });
        await this.runFfmpeg(command, "-");
        if (start != null) silences.push({start: start, end: duration, category: "silence"});
        return silences.map(silence => ({start: Math.ceil(silence.start * 10) / 10, end: Math.floor(Math.min(silence.end, duration || silence.end) * 10) / 10, category: "silence"})).filter(silence => silence.end - silence.start >= 1);
    }
}

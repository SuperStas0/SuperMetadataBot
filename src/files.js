import fs from "node:fs";
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

    /** @type {{locked?: boolean, shareCookies?: boolean}} */
    static settings = this.exists("static", "settings.json") ? this.load("static", "settings.json") : {};

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
        this.save(this.path(path, "data.json"), {id: data.id, posterId: data.posterId, title: data.title, performer: data.performer, duration: data.duration, limited: data.limited});
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
                if (!name.startsWith("audio.m4a")) continue;
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
                if (/^poster\d*(-square)?\.jpg$/.test(name) && now - fs.statSync(path).mtimeMs > maxAge) this.tryDelete(path);
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
     */
    static async cut(inputPath, outputPath, parts) {
        if (parts.length == 1) {
            var [start, end] = parts[0];
            return await new Promise((resolve, reject) => {
                var command = ffmpeg(inputPath).setStartTime(start);
                if (end != null) command.setDuration(end - start);
                command.audioCodec("copy").on("end", resolve).on("error", reject).save(outputPath);
            })
        }
        var listPath = `${outputPath}.txt`;
        var source = resolvePath(inputPath).replaceAll("\\", "/").replaceAll("'", "'\\''");
        var lines = parts.flatMap(([start, end]) => [`file '${source}'`, `inpoint ${start}`, ...(end == null ? [] : [`outpoint ${end}`])]);
        this.write(listPath, `${lines.join("\n")}\n`);
        try {
            await new Promise((resolve, reject) => ffmpeg(listPath).inputOptions("-f", "concat", "-safe", "0").audioCodec("copy").on("end", resolve).on("error", reject).save(outputPath));
        }
        finally {
            this.tryDelete(listPath);
        }
    }

    /**
     * @param {string} inputPath
     * @param {string} outputPath
     * @param {boolean} copy
     * @returns {Promise<number>} duration in seconds
     */
    static async importAudio(inputPath, outputPath, copy) {
        return await new Promise((resolve, reject) => {
            var duration = 0;
            var command = ffmpeg(inputPath).on("codecData", data => { duration = Utility.parseClock(data.duration); }).outputOptions("-map", "0:a:0", "-map_metadata", "-1");
            if (copy) command.audioCodec("copy");
            else command.audioCodec("aac").audioBitrate("192k");
            command.on("end", () => resolve(Math.round(duration))).on("error", reject).save(outputPath);
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
     * @param {string} inputPath
     * @param {string} outputPath
     */
    static async square(inputPath, outputPath) {
        var temp = outputPath.replace(/\.jpg$/, ".tmp.jpg");
        try {
            await new Promise((resolve, reject) => ffmpeg(inputPath).videoFilters("crop='min(iw,ih)':'min(iw,ih)'", "scale=320:320").outputOptions("-frames:v", "1", "-q:v", "3").on("end", resolve).on("error", reject).save(temp));
        }
        catch (error) {
            this.tryDelete(temp);
            throw error;
        }
        this.move(temp, outputPath);
    }
}

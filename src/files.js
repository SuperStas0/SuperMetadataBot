import fs from "node:fs";
import { join } from "path";
import ffmpeg from "fluent-ffmpeg";
import { AudioSource } from "./audio.js";

export class Files {
    /** @type {ConfigFile} */
    static config = this.load("static", "config.json");

    static {
        var missing = ["botToken", "admin", "apiId", "apiHash"].filter(key => !this.config[key]);
        if (missing.length) throw new Error(`static\\config.json is missing: ${missing.join(", ")}`);
    }

    /** @type {string} */
    static helpText = this.read("static", "help.md");

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
     */
    static write(path, data) {
        fs.writeFileSync(path, data);
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
        for (var user of this.list(this.path("downloads", "users"))) {
            for (var name of this.list(this.path("downloads", "users", user))) {
                if (name.endsWith(".m4a")) this.delete(this.path("downloads", "users", user, name));
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
            console.log(error);
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
        for (var id of this.list(this.path("downloads", "youtube"))) {
            var folder = this.path("downloads", "youtube", id);
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
                if (/^poster\d*\.jpg$/.test(name) && now - fs.statSync(path).mtimeMs > maxAge) this.tryDelete(path);
            }
        }
    }

    /**
     * @param {string} inputPath
     * @param {string} outputPath
     * @param {number} start
     * @param {number} duration
     */
    static async cut(inputPath, outputPath, start, duration) {
        return await new Promise((resolve, reject) => ffmpeg(inputPath).setStartTime(start ?? 0).setDuration(duration).audioCodec("copy").on("end", resolve).on("error", reject).save(outputPath));
    }
}

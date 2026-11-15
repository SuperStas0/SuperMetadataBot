import fs from "node:fs";
import { join } from "path";
import ffmpeg from "fluent-ffmpeg";
import { AudioSource } from "./audio.js";

export class Files {
    /** @type {ConfigFile} */
    static config = this.load("static", "config.json");

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
        this.save(this.path(path, "data.json"), {id: data.id, posterId: data.posterId, title: data.title, performer: data.performer, duration: data.duration});
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
        for (var user of this.list(this.path("downloads", "users"))) {
            for (var name of this.list(this.path("downloads", "users", user))) {
                if (name.endsWith(".m4a")) this.delete(this.path("downloads", "users", user, name));
            }
        }
    }

    /**
     * @param {number} maxAge
     */
    static cleanCache(maxAge) {
        for (var id of this.list(this.path("downloads", "youtube"))) {
            for (var name of this.list(this.path("downloads", "youtube", id))) {
                var path = this.path("downloads", "youtube", id, name);
                if (name.startsWith("audio.m4a") && Date.now() - fs.statSync(path).mtimeMs > maxAge) this.delete(path);
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

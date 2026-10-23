import fs from "node:fs";
import join from "path";
import ffmpeg, { setFfmpegPath } from "fluent-ffmpeg";

export class Files {
    /** @type {ConfigFile} */
    static config = this.load("..", "static", "config.json");

    /** @type {string} */
    static helpText = this.read("..", "static", "help.md");

    /**
     * @overload
     * @param {string} path
     * @return {NonSharedBuffer}
     * @overload
     * @param {string[]} path
     * @return {NonSharedBuffer}
     */
    static read(...path) {
        return fs.readFileSync(this.path(...path));
    }

    /**
     * @param {string} path
     * @param {string} data
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
     * @return {AudioData}
     */
    static loadAudio(path) {
        return this.load(this.path(path, "data.json"));
    }

    /**
     * @param {string} path
     * @param {AudioData} data
     */
    static saveAudio(path, data) {
        this.save(this.path(path, "data.json"), data);
    }

    /**
     * @overload
     * @param {string} path
     * @overload
     * @param {string[]} path
     */
    static exists(...path) {
        return fs.existsSync(...path);
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

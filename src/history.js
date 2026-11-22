import { Files } from "./files.js";
import { Utility } from "./utility.js";
import { Log } from "./log.js";

export class History {
    static file = "logs/audio.json";

    static max = 50;

    static pageSize = 3500;

    /** @type {HistoryEntry[]} */
    static entries = this.read();

    static nextId = this.entries.reduce((last, entry) => Math.max(last, entry.id), 0) + 1;

    /**
     * @returns {HistoryEntry[]}
     */
    static read() {
        try {
            return Files.exists(this.file) ? Files.load(this.file) : [];
        }
        catch (error) {
            Log.error("Read history", error);
            return [];
        }
    }

    static save() {
        try {
            Files.createFolder("logs");
            Files.write(`${this.file}.tmp`, JSON.stringify(this.entries));
            Files.move(`${this.file}.tmp`, this.file);
        }
        catch (error) {
            Log.error("Save history", error);
        }
    }

    /**
     * @param {import("./user.js").User} user
     * @param {import("./audio.js").Audio} audio
     * @param {TelegramFile} [file]
     */
    static record(user, audio, file) {
        var source = audio.source;
        var entry = this.get(audio.logId);
        if (!entry) {
            entry = {id: this.nextId++, time: Date.now(), userId: user.id, user: user.name, title: source.title, performer: source.performer, upload: !!file, fileId: file ? file.id : source.id, document: !!file?.document, changes: null};
            this.entries.push(entry);
            if (this.entries.length > this.max) this.entries.splice(0, this.entries.length - this.max);
            audio.logId = entry.id;
        }
        else if (!file) entry.fileId = source.id;
        this.save();
    }

    /**
     * @param {import("./audio.js").Audio} audio
     */
    static update(audio) {
        var entry = this.get(audio.logId);
        if (!entry) return;
        entry.changes = this.getChanges(audio);
        this.save();
    }

    /**
     * @param {number | null} id
     */
    static get(id) {
        return id == null ? undefined : this.entries.find(entry => entry.id == id);
    }

    /**
     * @param {import("./audio.js").Audio} audio
     * @returns {string[]}
     */
    static getChanges(audio) {
        var source = audio.source;
        var changes = [];
        if (audio.title != null && audio.title != source.title) changes.push(`title: ${source.title} -> ${audio.title}`);
        if ((audio.performer ?? null) != (source.performer ?? null)) changes.push(`performer: ${source.performer ?? "none"} -> ${audio.performer ?? "none"}`);
        if (audio.cuts.length) changes.push(`cuts: ${audio.cuts.map(([start, end]) => `${Utility.getDurationString(start)}-${Utility.getDurationString(end)}`).join(", ")}`);
        var poster = source.uploaded && !Files.exists(source.path, "poster.jpg") ? null : "default";
        if (audio.poster != poster) changes.push(audio.poster == "custom" ? "poster: custom" : audio.poster == "default" ? "poster: default" : "poster: removed");
        else if (audio.poster && audio.posterSquare != !source.uploaded) changes.push(audio.posterSquare ? "poster: square" : "poster: original");
        return changes;
    }

    /**
     * @param {HistoryEntry} entry
     */
    static format(entry) {
        var name = String(entry.performer ? `${entry.title} - ${entry.performer}` : entry.title ?? "").replace(/\s+/g, " ");
        var time = new Date(entry.time).toISOString().slice(0, 16).replace("T", " ");
        var changes = entry.changes ? (entry.changes.length ? entry.changes.join("; ").replace(/\s+/g, " ") : "none") : "not sent";
        return [`/log_${entry.id} ${name}`, `User: ${entry.user || "unknown"}, ${entry.userId}`, `Source: ${entry.upload ? "upload" : "YouTube"}, ${time} UTC`, `Changes: ${changes}`].join("\n");
    }

    /**
     * @returns {string[]}
     */
    static getPages() {
        if (!this.entries.length) return ["Log is empty"];
        var pages = [];
        var page = "";
        for (var entry of this.entries.toReversed()) {
            var text = this.format(entry);
            if (page && page.length + text.length + 2 > this.pageSize) {
                pages.push(page);
                page = "";
            }
            page += page ? `\n\n${text}` : text;
        }
        pages.push(page);
        return pages;
    }
}

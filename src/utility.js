export class Utility {
    /** @type {Record<string, Promise<void>>} */
    static locks = {};

    /** @type {Record<string, {running: number, waiting: (() => void)[]}>} */
    static queues = {};

    /**
     * @param {number} duration
     * @param {Cut[]} cuts
     */
    static getDuration(duration, cuts) {
        return duration - cuts.reduce((total, [start, end]) => total + end - start, 0);
    }

    /**
     * @param {Cut[]} cuts
     * @returns {Cut[]}
     */
    static mergeCuts(cuts) {
        var merged = [];
        for (var [start, end] of cuts.toSorted((first, second) => first[0] - second[0])) {
            var last = merged[merged.length - 1];
            if (last && start <= last[1]) last[1] = Math.max(last[1], end);
            else merged.push([start, end]);
        }
        return merged;
    }

    /**
     * @param {Cut[]} cuts merged cuts
     * @param {number} duration
     * @returns {[number, number | null][]} parts to keep, null end means the end of the file
     */
    static getKept(cuts, duration) {
        var kept = [];
        var position = 0;
        for (var [start, end] of cuts) {
            if (start > position) kept.push([position, start]);
            position = end;
        }
        if (position < duration) kept.push([position, null]);
        return kept;
    }

    /**
     * @param {number} bytes
     */
    static getSizeString(bytes) {
        var units = ["B", "KB", "MB", "GB", "TB"];
        var index = 0;
        while (bytes >= 1024 && index < units.length - 1) {
            bytes /= 1024;
            index++;
        }
        return index ? `${bytes.toFixed(1)} ${units[index]}` : `${bytes} B`;
    }

    /**
     * @param {{name: string, size: number, count: number}[]} groups
     * @param {number} free
     * @param {number} limit
     */
    static getStorageText(groups, free, limit) {
        var total = groups.reduce((sum, group) => sum + group.size, 0);
        var audio = groups.filter(group => group.audio).reduce((sum, group) => sum + group.size, 0);
        var lines = [`Used: ${this.getSizeString(total)}`, `Free on disk: ${this.getSizeString(free)}`, `Cached audio: ${this.getSizeString(audio)} of ${this.getSizeString(limit)} limit`, ""];
        for (var group of groups.filter(group => group.count).sort((first, second) => second.size - first.size)) {
            lines.push(`${group.name}: ${this.getSizeString(group.size)}, ${Math.round(group.size / (total || 1) * 100)}%, ${group.count} files`);
        }
        return lines.join("\n");
    }

    /**
     * @param {string} text
     * @param {number} duration
     * @returns {{cuts?: Cut[], error?: string}}
     */
    static parseCuts(text, duration) {
        var cuts = [];
        for (var part of text.split(/[\n,;]+/)) {
            part = part.trim();
            if (!part) continue;
            var sides = part.split("-").map(side => side.trim().toLowerCase());
            if (sides.length != 2 || !sides[0] && !sides[1]) return {error: `Incorrect format: ${part}`};
            var start = !sides[0] || sides[0] == "start" ? 0 : this.parseTimecode(sides[0]);
            var end = !sides[1] || sides[1] == "end" ? duration : this.parseTimecode(sides[1]);
            if (start == null || end == null) return {error: `Incorrect format: ${part}`};
            if (start >= duration) return {error: `Beyond the duration ${this.getDurationString(duration)}: ${part}`};
            end = Math.min(end, duration);
            if (start >= end) return {error: `Start must be before end: ${part}`};
            cuts.push([start, end]);
        }
        return cuts.length ? {cuts: cuts} : {error: "Incorrect format"};
    }

    /**
     * @param {number} duration
     */
    static getDurationString(duration) {
        var mins = Math.floor(duration / 60);
        var secs = Math.floor(duration % 60);
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
    }

    /**
     * @param {Context} ctx
     * @returns {string[]}
     */
    static getUrls(ctx) {
        if (!ctx.message.entities) return [];
        return ctx.message.entities.filter(entity => entity.type == "url").map(entity => ctx.message.text.slice(entity.offset, entity.offset + entity.length)).filter(url => this.getIdFromUrl(url));
    }

    /**
     * @param {Context} ctx
     * @returns {string[]}
     */
    static getPlaylistUrls(ctx) {
        if (!ctx.message.entities) return [];
        var ids = ctx.message.entities.filter(entity => entity.type == "url").map(entity => this.getListFromUrl(ctx.message.text.slice(entity.offset, entity.offset + entity.length))).filter(id => id);
        return [...new Set(ids)].map(id => `https://www.youtube.com/playlist?list=${id}`);
    }

    /**
     * @param {string} url
     * @returns {string | null}
     */
    static getListFromUrl(url) {
        try {
            var parsed = new URL(url.includes("://") ? url : `https://${url}`);
        }
        catch {
            return null;
        }
        var host = parsed.hostname.replace(/^(www|m|music)\./, "");
        var id = host == "youtube.com" && parsed.pathname == "/playlist" ? parsed.searchParams.get("list") : null;
        return id && /^[A-Za-z0-9_-]{10,64}$/.test(id) ? id : null;
    }

    /**
     * @param {string} url
     * @returns {string | null}
     */
    static getIdFromUrl(url) {
        try {
            var parsed = new URL(url.includes("://") ? url : `https://${url}`);
        }
        catch {
            return null;
        }
        var host = parsed.hostname.replace(/^(www|m|music)\./, "");
        var id = null;
        if (host == "youtu.be") id = parsed.pathname.split("/")[1];
        else if (host == "youtube.com") id = parsed.pathname == "/watch" ? parsed.searchParams.get("v") : parsed.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1];
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }

    /**
     * @param {string} text
     * @returns {number | null}
     */
    static parseTimecode(text) {
        text = text.trim();
        if (!/^\d+(:[0-5]?\d){0,2}$/.test(text)) return null;
        return text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
    }

    /**
     * @param {string} text
     * @returns {number}
     */
    static parseClock(text) {
        var match = text?.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
        return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
    }

    /**
     * @param {number | null} views
     */
    static getViewsString(views) {
        return views == null ? "" : new Intl.NumberFormat("en", {notation: "compact", maximumFractionDigits: 1}).format(views);
    }

    /**
     * @param {{file_name?: string, mime_type?: string}} document
     */
    static isAudioDocument(document) {
        return /^audio\//i.test(document.mime_type ?? "") || /\.(mp3|m4a|flac|ogg|oga|opus|wav|aac|wma|aiff?)$/i.test(document.file_name ?? "");
    }

    /**
     * @param {string} text
     * @returns {string | null}
     */
    static parseCookies(text) {
        var lines = [];
        for (var line of text.split(/\r?\n/)) {
            var fields = line.replace(/^#HttpOnly_/, "").split("\t");
            if (fields.length != 7 || !/^(-?\d+(\.\d+)?)?$/.test(fields[4])) continue;
            if (/^(.+\.)?(youtube|google)\.com$/.test(fields[0].replace(/^\./, "").toLowerCase())) lines.push(line);
        }
        return lines.length ? `# Netscape HTTP Cookie File\n${lines.join("\n")}\n` : null;
    }

    /**
     * @param {string} key
     * @param {() => Promise<void>} task
     */
    static async lock(key, task) {
        var current = (this.locks[key] ?? Promise.resolve()).catch(() => {}).then(task);
        this.locks[key] = current;
        try {
            await current;
        }
        finally {
            if (this.locks[key] == current) delete this.locks[key];
        }
    }

    /**
     * @param {string} name
     * @param {number} max
     * @param {() => Promise<any>} task
     */
    static async queue(name, max, task) {
        var queue = this.queues[name] ??= {running: 0, waiting: []};
        if (queue.running >= max) await new Promise(resolve => queue.waiting.push(resolve));
        queue.running++;
        try {
            return await task();
        }
        finally {
            queue.running--;
            queue.waiting.shift()?.();
        }
    }

    /**
     * @param {Promise<any>} promise
     * @param {number} ms
     * @param {string} message
     */
    static async timeout(promise, ms, message) {
        var timer;
        try {
            return await Promise.race([promise, new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })]);
        }
        finally {
            clearTimeout(timer);
        }
    }

    /**
     * @param {string | null} text
     */
    static escapeCode(text) {
        return text?.replaceAll("\\", "\\\\").replaceAll("`", "\\`") ?? null;
    }

    /**
     * @param {string} text
     */
    static escapeText(text) {
        return text.replace(/[\\_*\[\]()~`>#+\-=|{}.!]/g, "\\$&");
    }

    /**
     * @param {string} text
     */
    static escapeMarkdown(text) {
        return text.replace(/[\\[\]()~>#+\-=|{}.!]/g, "\\$&");
    }

    /**
     * @param {string} name
     */
    static getFileName(name) {
        var cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").slice(0, 100).replace(/[. ]+$/, "");
        if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) cleaned = `_${cleaned}`;
        return cleaned || "audio";
    }
}

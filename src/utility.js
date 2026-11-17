export class Utility {
    /** @type {Record<string, Promise<void>>} */
    static locks = {};

    /** @type {Record<string, {running: number, waiting: (() => void)[]}>} */
    static queues = {};

    /**
     * @param {number} duration
     * @param {number | null} start
     * @param {number | null} end
     */
    static getDuration(duration, start, end) {
        start ??= 0;
        end ??= duration;
        return end-start;
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
     * @param {string} name
     */
    static getFileName(name) {
        var cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").slice(0, 100).replace(/[. ]+$/, "");
        if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(cleaned)) cleaned = `_${cleaned}`;
        return cleaned || "audio";
    }
}

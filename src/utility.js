export class Utility {
    /**
     * @param {number} duration
     * @param {number} start
     * @param {number} end
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
        return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
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

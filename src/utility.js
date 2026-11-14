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
        var id = null;
        if (url.includes("watch?v=")) id = url.split("?")[1].split("&")[0].replaceAll("v=","");
        else if (url.includes("youtu.be")) id = url.split("?")[0].split("/").toReversed()[0];
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
    }

    /**
     * @param {string} name
     */
    static getFileName(name) {
        var cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, "").replace(/[. ]+$/, "");
        return cleaned || "audio";
    }
}

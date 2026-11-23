import fs from "node:fs";

export class Log {
    static file = "logs/error.log";

    static maxSize = 1024 * 1024;

    static maxText = 3000;

    /** @type {string[]} */
    static secrets = [];

    /**
     * @param {string} context
     * @param {any} error
     */
    static error(context, error) {
        console.log(error);
        try {
            var entry = `=== ${new Date().toISOString()} ${context}\n${this.redact(error?.stack ?? String(error))}\n`;
            fs.mkdirSync("logs", {recursive: true});
            if (fs.existsSync(this.file) && fs.statSync(this.file).size > this.maxSize) fs.renameSync(this.file, `${this.file}.old`);
            fs.appendFileSync(this.file, entry);
        }
        catch (failure) {
            console.log(failure);
        }
    }

    /**
     * @param {string} text
     */
    static redact(text) {
        for (var secret of this.secrets) text = text.replaceAll(secret, "[redacted]");
        return text;
    }

    /**
     * @returns {string | null}
     */
    static last() {
        for (var path of [this.file, `${this.file}.old`]) {
            if (!fs.existsSync(path)) continue;
            var entries = fs.readFileSync(path, "utf8").split(/^(?==== )/m).filter(entry => entry.trim());
            if (entries.length) return entries[entries.length - 1].trim().slice(0, this.maxText);
        }
        return null;
    }
}

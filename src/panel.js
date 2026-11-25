import { App } from "../main.js";
import { Files } from "./files.js";
import { History } from "./history.js";
import { Menus } from "./menus.js";
import { Utility } from "./utility.js";
import { Log } from "./log.js";

export class Panel {
    static options = {
        access: {title: "Access", key: "access", modes: ["public", "confirm", "private"], names: {public: "public", confirm: "confirmation", private: "private"}},
        cookies: {title: "Cookie sharing", key: "shareCookies", modes: ["on", "confirm", "off"], names: {on: "on", confirm: "confirmation", off: "off"}},
        search: {title: "Search confirmation", key: "searchConfirm", modes: ["on", "nonadmin", "off"], names: {on: "on", nonadmin: "non-admin only", off: "off"}},
        large: {title: "Large files", key: "largeFiles", modes: ["on", "confirm", "off"], names: {on: "on", confirm: "confirmation", off: "off"}},
        cache: {title: "Cache size", key: "cacheSize", modes: ["scarce", "default", "ultimate", "disabled"], names: {scarce: "scarce, 2 GB, 1 day", default: "default, 5 GB, 7 days", ultimate: "ultimate, 50 GB, 30 days", disabled: "disabled, no limits"}}
    };

    static styles = {public: "success", on: "success", confirm: "primary", nonadmin: "primary", private: "danger", off: "danger", scarce: "danger", default: "primary", ultimate: "success", disabled: "success"};

    static askTimeout = 10 * 60 * 1000;

    static denyCooldown = 60 * 60 * 1000;

    /** @type {number | null} */
    static message = null;

    static counter = 0;

    static pageSize = 8;

    static sources = {youtube: "YouTube audio", telegram: "Uploaded audio"};

    static listCounter = 0;

    static listing = false;

    static filter = "";

    /** @type {number | null} */
    static listMessage = null;

    /** @type {{id: string, path: string, title: string, size: number, time: number, key: number}[]} audios shown in the last opened list */
    static items = [];

    /** @type {{source: "youtube" | "telegram", page: number}} */
    static listed = {source: "youtube", page: 0};

    /** @type {Record<number, {resolve: (result: string) => void, timer: NodeJS.Timeout, message: number, text: string}>} */
    static requests = {};

    static maxQueued = 10;

    /** @type {Map<number, any[]>} updates received from a user while the admin decides, by user id */
    static pendingAccess = new Map();

    /** @type {Map<number, number>} */
    static deniedAccess = new Map();

    static main() {
        return {text: "Admin panel", markup: Menus.GenerateMarkup(["Log", "panel:log:0", 0], ["Storage", "panel:storage", 0], ["Errors", "panel:error", 1], ["Settings", "panel:settings", 1], ["Delete audio", "panel:delete", 2], ["Close", "panel:close", 3])};
    }

    /**
     * @param {number} page
     */
    static log(page) {
        var pages = History.getPages();
        page = Math.min(page, pages.length - 1);
        var buttons = [];
        if (page > 0) buttons.push(["Previous", `panel:log:${page - 1}`, 0]);
        if (page < pages.length - 1) buttons.push(["Next", `panel:log:${page + 1}`, 0]);
        buttons.push(["Back", "panel:main", buttons.length ? 1 : 0]);
        return {text: pages.length > 1 ? `${pages[page]}\n\nPage ${page + 1}/${pages.length}` : pages[page], markup: Menus.GenerateMarkup(...buttons)};
    }

    static storage() {
        return {text: Utility.getStorageText(Files.getStorage(), Files.getFreeSpace(), App.getCache().size), markup: Menus.GenerateMarkup(["Refresh", "panel:storage", 0], ["Back", "panel:main", 1])};
    }

    static deleteMenu() {
        return {text: "Delete audio", markup: Menus.GenerateMarkup(["Last loaded", "panel:last", 0], ["YouTube audio", "panel:youtube", 1], ["Uploaded audio", "panel:telegram", 1], ["Back", "panel:main", 2])};
    }

    /**
     * @param {"youtube" | "telegram"} source
     * @param {number} page
     */
    static audioList(source, page) {
        var all = Files.listAudios(source).map(item => ({...item, key: ++this.listCounter}));
        var filter = this.filter.toLowerCase();
        this.items = filter ? all.filter(item => item.title.replace(/\s+/g, " ").toLowerCase().includes(filter) || item.performer.replace(/\s+/g, " ").toLowerCase().includes(filter)) : all;
        var pages = Math.max(1, Math.ceil(this.items.length / this.pageSize));
        page = Math.min(page, pages - 1);
        this.listed = {source: source, page: page};
        var from = page * this.pageSize;
        var shown = this.items.slice(from, from + this.pageSize);
        var total = this.items.reduce((sum, item) => sum + item.size, 0);
        var lines = [`${this.sources[source]}: \`${filter ? `${this.items.length} of ${all.length}` : this.items.length} stored, ${Utility.getSizeString(total)}\``];
        if (filter) lines.push(`Filter: \`${Utility.escapeCode(this.filter)}\``);
        shown.forEach((item, index) => {
            var title = Utility.escapeCode(item.title.replace(/\s+/g, " ").slice(0, 40)) || item.id;
            lines.push(`${from + index + 1}\\. \`${title}\` \`${Utility.getSizeString(item.size)}, ${new Date(item.time).toISOString().slice(0, 10)}\``);
        });
        if (pages > 1) lines.push(`Page ${page + 1}/${pages}`);
        lines.push(shown.length ? "Select a number to delete that audio" : filter ? "No audio matches the filter" : "No audio in storage");
        if (!filter) lines.push("Send a text to filter by title or performer");
        var buttons = shown.map((item, index) => [`${from + index + 1}`, `panel:remove:${item.key}`, Math.floor(index / 4), "danger"]);
        var row = Math.ceil(shown.length / 4);
        var start = buttons.length;
        if (page > 0) buttons.push(["Previous", `panel:${source}:${page - 1}`, row]);
        if (page < pages - 1) buttons.push(["Next", `panel:${source}:${page + 1}`, row]);
        if (buttons.length > start) row++;
        if (filter) buttons.push(["Clear filter", "panel:clear", row++]);
        buttons.push(["Back", "panel:delete", row]);
        return {text: lines.join("\n"), markup: Menus.GenerateMarkup(...buttons)};
    }

    static error() {
        var text = Log.last();
        if (!text) return {text: "No errors logged", markup: Menus.GenerateMarkup(["Back", "panel:main", 0])};
        var escaped = Utility.escapeCode(text);
        while (escaped.length > 3800) escaped = Utility.escapeCode(text = text.slice(0, -200));
        return {text: `\`\`\`\n${escaped}\n\`\`\``, markup: Menus.GenerateMarkup(["Refresh", "panel:error", 0], ["Back", "panel:main", 1])};
    }

    static settings() {
        var options = Object.entries(this.options);
        var lines = options.map(([, option]) => `${option.title}: \`${option.names[Files.getSetting(option.key)]}\``);
        var buttons = options.map(([name, option], row) => [option.title, `panel:${name}`, row, this.styles[Files.getSetting(option.key)]]);
        buttons.push(["Back", "panel:main", buttons.length]);
        return {text: `Settings\n${lines.join("\n")}`, markup: Menus.GenerateMarkup(...buttons)};
    }

    /**
     * @param {string[]} modes
     * @param {string} current
     */
    static next(modes, current) {
        return modes[(modes.indexOf(current) + 1) % modes.length];
    }

    /**
     * @param {string} name
     * @param {import("./user.js").User} user
     * @returns {string | null} error text
     */
    static toggle(name, user) {
        var option = this.options[name];
        var next = this.next(option.modes, Files.getSetting(option.key));
        if (name == "cookies" && next != "off" && !user.hasCookies()) return "Send your YouTube cookies first, see /cookies";
        Files.settings[option.key] = next;
        Files.saveSettings();
        if (name == "cache") {
            App.schedule();
            App.clean();
        }
        return null;
    }

    /**
     * @param {import("./user.js").User} user
     */
    static async open(user) {
        if (this.message) App.app.telegram.deleteMessage(user.id, this.message).catch(() => {});
        this.message = null;
        this.listing = false;
        this.filter = "";
        var view = this.main();
        var msg = await App.app.telegram.sendMessage(user.id, view.text, view.markup);
        this.message = msg.message_id;
    }

    /**
     * @param {Context} ctx
     * @param {{text: string, markup: any}} view
     * @param {number} [message] edit this message instead of the one of the pressed button
     */
    static async show(ctx, view, message) {
        try {
            if (message) await ctx.telegram.editMessageText(ctx.chat.id, message, undefined, view.text, view.markup);
            else await ctx.editMessageText(view.text, view.markup);
        }
        catch (error) {
            if (!error.response?.description?.includes("message is not modified")) Log.error("Panel", error);
        }
    }

    /**
     * @param {Context} ctx
     * @param {import("./user.js").User} user
     * @param {string} name
     * @param {number} page
     */
    static async handle(ctx, user, name, page) {
        if (name == "close") {
            this.message = null;
            this.listing = false;
            this.filter = "";
            ctx.answerCbQuery().catch(() => {});
            ctx.deleteMessage().catch(() => {});
            return;
        }
        if (name == "last") return this.deleteLast(ctx, user);
        if (name == "remove") return this.removeAudio(ctx, page);
        if (Object.hasOwn(this.options, name)) {
            var error = this.toggle(name, user);
            if (error) return ctx.answerCbQuery(error, {show_alert: true}).catch(() => {});
            name = "settings";
        }
        if (name == "clear" && this.listing) {
            this.filter = "";
            name = this.listed.source;
            page = 0;
        }
        this.listing = Object.hasOwn(this.sources, name);
        if (this.listing) this.listMessage = ctx.callbackQuery.message?.message_id ?? null;
        else this.filter = "";
        ctx.answerCbQuery().catch(() => {});
        var view = name == "log" ? this.log(page) : name == "storage" ? this.storage() : name == "error" ? this.error() : name == "settings" ? this.settings() : name == "delete" ? this.deleteMenu() : Object.hasOwn(this.sources, name) ? this.audioList(name, page) : this.main();
        await this.show(ctx, view);
    }

    /**
     * Filters the opened audio list by title or performer
     * @param {Context} ctx
     * @param {string} text
     */
    static async setFilter(ctx, text) {
        ctx.deleteMessage(ctx.message.message_id).catch(() => {});
        var filter = text.replace(/\s+/g, " ").trim().slice(0, 200);
        if (!filter || !this.listMessage) return;
        this.filter = filter;
        await this.show(ctx, this.audioList(this.listed.source, 0), this.listMessage);
    }

    /**
     * Deletes the audios of the last load of the admin, the whole batch if there are several
     * @param {Context} ctx
     * @param {import("./user.js").User} user
     */
    static deleteLast(ctx, user) {
        var paths = user.status == "default" ? [...new Set(user.getAudios().map(audio => audio.source.path).filter(Boolean))] : [];
        if (!paths.length) return ctx.answerCbQuery("Load an audio first", {show_alert: true}).catch(() => {});
        try {
            paths.forEach(path => Files.deleteAudio(path));
        }
        catch (error) {
            Log.error("Delete last audio", error);
            return ctx.answerCbQuery("Failed to delete", {show_alert: true}).catch(() => {});
        }
        user.removeMenu();
        user.status = "none";
        ctx.answerCbQuery(paths.length > 1 ? `${paths.length} audios deleted from the server` : "Audio deleted from the server").catch(() => {});
    }

    /**
     * @param {Context} ctx
     * @param {number} key of the audio in the opened list
     */
    static async removeAudio(ctx, key) {
        var item = this.items.find(item => item.key == key);
        if (!item) return ctx.answerCbQuery("The list changed, open it again", {show_alert: true}).catch(() => {});
        if (Object.values(App.data).some(user => user.status == "loading")) return ctx.answerCbQuery("Audio is being loaded, try again later", {show_alert: true}).catch(() => {});
        var text = `Deleted: ${item.title}`.slice(0, 200);
        try {
            Files.deleteAudio(item.path);
        }
        catch (error) {
            Log.error("Delete audio", error);
            text = "Failed to delete";
        }
        ctx.answerCbQuery(text).catch(() => {});
        await this.show(ctx, this.audioList(this.listed.source, this.listed.page));
    }

    /**
     * @param {string} text
     * @param {AbortSignal} [signal]
     * @returns {Promise<"allow" | "deny" | "timeout" | "cancel" | "error">}
     */
    static async ask(text, signal) {
        signal?.throwIfAborted();
        var id = ++this.counter;
        try {
            var msg = await App.app.telegram.sendMessage(Files.config.admin, text, Menus.GeneratePlain(["Allow", `ask:allow:${id}`, 0], ["Deny", `ask:deny:${id}`, 0]));
        }
        catch (error) {
            Log.error("Ask the admin", error);
            return "error";
        }
        return await new Promise(resolve => {
            this.requests[id] = {resolve: resolve, timer: setTimeout(() => this.answer(id, "timeout"), this.askTimeout), message: msg.message_id, text: text};
            signal?.addEventListener("abort", () => this.answer(id, "cancel"), {once: true});
        })
    }

    /**
     * @param {number} id
     * @param {"allow" | "deny" | "timeout" | "cancel"} result
     * @returns {boolean} false if the request is no longer pending
     */
    static answer(id, result) {
        var request = this.requests[id];
        if (!request) return false;
        delete this.requests[id];
        clearTimeout(request.timer);
        var notes = {allow: "Allowed", deny: "Denied", timeout: "Timed out", cancel: "Cancelled"};
        App.app.telegram.editMessageText(Files.config.admin, request.message, null, `${request.text}\n${notes[result]}`).catch(() => {});
        request.resolve(result);
        return true;
    }

    /**
     * @param {import("./user.js").User} user
     * @param {string} title
     * @param {number} size
     * @param {AbortSignal} [signal]
     */
    static async askLarge(user, title, size, signal) {
        return await this.ask(`${user.name || user.id} wants to upload ${title} with size ${Utility.getSizeString(size)}`, signal) == "allow";
    }

    /**
     * @param {import("./user.js").User} user
     * @param {string} reason
     * @param {AbortSignal} [signal]
     */
    static async askCookies(user, reason, signal) {
        return await this.ask(`${user.name || user.id} wants to use your cookies for ${reason}`, signal) == "allow";
    }

    /**
     * @param {number} id
     * @param {string} name
     * @param {any} [update] the message that needs the access, it runs after the admin allows it
     * @returns {string} text for the user
     */
    static requestAccess(id, name, update) {
        var queued = this.pendingAccess.get(id);
        if (queued) {
            if (update && queued.length < this.maxQueued) queued.push(update);
            return "Waiting for the admin to allow access";
        }
        if (Date.now() - (this.deniedAccess.get(id) ?? 0) < this.denyCooldown) return "The admin denied access";
        this.pendingAccess.set(id, update ? [update] : []);
        this.ask(`${name || id} (${id}) wants to use the bot`).then(async result => {
            var updates = this.pendingAccess.get(id) ?? [];
            this.pendingAccess.delete(id);
            var text = "The admin did not answer, send a message to ask again";
            if (result == "allow") {
                if (!Files.settings.allowed?.includes(id)) (Files.settings.allowed ??= []).push(id);
                Files.saveSettings();
                text = updates.length ? "The admin allowed access" : "The admin allowed access, send a link or an audio file";
            }
            else if (result == "deny") {
                this.deniedAccess.set(id, Date.now());
                text = "The admin denied access";
            }
            await App.app.telegram.sendMessage(id, text).catch(() => {});
            if (result != "allow") return;
            for (var next of updates) await App.app.handleUpdate(next);
        })
        return "Access requested, wait for the admin to allow it";
    }
}

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
        large: {title: "Large files", key: "largeFiles", modes: ["on", "confirm", "off"], names: {on: "on", confirm: "confirmation", off: "off"}}
    };

    static styles = {public: "success", on: "success", confirm: "primary", nonadmin: "primary", private: "danger", off: "danger"};

    static askTimeout = 10 * 60 * 1000;

    static denyCooldown = 60 * 60 * 1000;

    /** @type {number | null} */
    static message = null;

    static counter = 0;

    /** @type {Record<number, {resolve: (result: string) => void, timer: NodeJS.Timeout, message: number, text: string}>} */
    static requests = {};

    /** @type {Set<number>} */
    static pendingAccess = new Set();

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
        return {text: Utility.getStorageText(Files.getStorage(), Files.getFreeSpace(), App.cacheSize), markup: Menus.GenerateMarkup(["Refresh", "panel:storage", 0], ["Back", "panel:main", 1])};
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
        return null;
    }

    /**
     * @param {import("./user.js").User} user
     */
    static async open(user) {
        if (this.message) App.app.telegram.deleteMessage(user.id, this.message).catch(() => {});
        this.message = null;
        var view = this.main();
        var msg = await App.app.telegram.sendMessage(user.id, view.text, view.markup);
        this.message = msg.message_id;
    }

    /**
     * @param {Context} ctx
     * @param {{text: string, markup: any}} view
     */
    static async show(ctx, view) {
        try {
            await ctx.editMessageText(view.text, view.markup);
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
            ctx.answerCbQuery().catch(() => {});
            ctx.deleteMessage().catch(() => {});
            return;
        }
        if (name == "delete") return this.deleteAudio(ctx, user);
        if (Object.hasOwn(this.options, name)) {
            var error = this.toggle(name, user);
            if (error) return ctx.answerCbQuery(error, {show_alert: true}).catch(() => {});
            name = "settings";
        }
        ctx.answerCbQuery().catch(() => {});
        var view = name == "log" ? this.log(page) : name == "storage" ? this.storage() : name == "error" ? this.error() : name == "settings" ? this.settings() : this.main();
        await this.show(ctx, view);
    }

    /**
     * @param {Context} ctx
     * @param {import("./user.js").User} user
     */
    static deleteAudio(ctx, user) {
        if (user.status != "default" || user.mode != "youtube") return ctx.answerCbQuery("Load a YouTube audio first", {show_alert: true}).catch(() => {});
        ctx.answerCbQuery().catch(() => {});
        ctx.deleteMessage().catch(() => {});
        this.message = null;
        user.removeMenu();
        user.status = "none";
        Files.delete(user.getSourcePath());
        user.parseLink().then(() => user.sendMenu("new"));
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
     * @returns {string} text for the user
     */
    static requestAccess(id, name) {
        if (this.pendingAccess.has(id)) return "Waiting for the admin to allow access";
        if (Date.now() - (this.deniedAccess.get(id) ?? 0) < this.denyCooldown) return "The admin denied access";
        this.pendingAccess.add(id);
        this.ask(`${name || id} (${id}) wants to use the bot`).then(result => {
            this.pendingAccess.delete(id);
            var text = "The admin did not answer, send a message to ask again";
            if (result == "allow") {
                if (!Files.settings.allowed?.includes(id)) (Files.settings.allowed ??= []).push(id);
                Files.saveSettings();
                text = "The admin allowed access, send a link or an audio file";
            }
            else if (result == "deny") {
                this.deniedAccess.set(id, Date.now());
                text = "The admin denied access";
            }
            App.app.telegram.sendMessage(id, text).catch(() => {});
        })
        return "Access requested, wait for the admin to allow it";
    }
}

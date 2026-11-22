import { App } from "../main.js";
import { Files } from "./files.js";
import { History } from "./history.js";
import { Menus } from "./menus.js";
import { Utility } from "./utility.js";
import { Log } from "./log.js";

export class Panel {
    static toggles = ["access", "cookies", "search", "large"];

    static searchModes = ["on", "nonadmin", "off"];

    static searchNames = {on: "on", nonadmin: "non-admin only", off: "off"};

    static largeModes = ["on", "confirm", "off"];

    static largeNames = {on: "on", confirm: "confirmation", off: "off"};

    static largeTimeout = 10 * 60 * 1000;

    /** @type {number | null} */
    static message = null;

    static counter = 0;

    /** @type {Record<number, {resolve: (allowed: boolean) => void, timer: NodeJS.Timeout, message: number, text: string}>} */
    static requests = {};

    static main() {
        return {text: "Admin panel", markup: Menus.GenerateMarkup(["Log", "panel:log:0", 0], ["Storage", "panel:storage", 0], ["Settings", "panel:settings", 1], ["Delete audio", "panel:delete", 1], ["Close", "panel:close", 2])};
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

    static settings() {
        var settings = Files.settings;
        var styles = {on: "success", confirm: "primary", nonadmin: "primary", off: "danger"};
        var states = [
            ["Global access", "access", settings.locked ? "off" : "on", {on: "on", off: "off"}],
            ["Cookie sharing", "cookies", settings.shareCookies ? "on" : "off", {on: "on", off: "off"}],
            ["Search confirmation", "search", settings.searchConfirm ?? "on", this.searchNames],
            ["Large files", "large", settings.largeFiles ?? "off", this.largeNames]
        ];
        var lines = states.map(([title, , state, names]) => `${title}: \`${Utility.escapeCode(names[state])}\``);
        var buttons = states.map(([title, name, state], row) => [title, `panel:${name}`, row, styles[state]]);
        buttons.push(["Back", "panel:main", states.length]);
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
        var settings = Files.settings;
        if (name == "access") settings.locked = !settings.locked;
        else if (name == "cookies") {
            if (!settings.shareCookies && !user.hasCookies()) return "Send your YouTube cookies first, see /cookies";
            settings.shareCookies = !settings.shareCookies;
        }
        else if (name == "search") settings.searchConfirm = this.next(this.searchModes, settings.searchConfirm ?? "on");
        else if (name == "large") settings.largeFiles = this.next(this.largeModes, settings.largeFiles ?? "off");
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
        if (this.toggles.includes(name)) {
            var error = this.toggle(name, user);
            if (error) return ctx.answerCbQuery(error, {show_alert: true}).catch(() => {});
            name = "settings";
        }
        ctx.answerCbQuery().catch(() => {});
        var view = name == "log" ? this.log(page) : name == "storage" ? this.storage() : name == "settings" ? this.settings() : this.main();
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
        user.menu = null;
        user.status = "none";
        Files.delete(user.getSourcePath());
        user.parseLink().then(() => user.sendMenu("new"));
    }

    /**
     * @param {import("./user.js").User} user
     * @param {string} title
     * @param {number} size
     * @returns {Promise<boolean>}
     */
    static async askLarge(user, title, size) {
        var id = ++this.counter;
        var text = `${user.name || user.id} wants to upload ${title} with size ${Utility.getSizeString(size)}`;
        try {
            var msg = await App.app.telegram.sendMessage(Files.config.admin, text, Menus.GeneratePlain(["Allow", `large:allow:${id}`, 0], ["Deny", `large:deny:${id}`, 0]));
        }
        catch (error) {
            Log.error(`Ask large file (user ${user.id})`, error);
            return false;
        }
        return await new Promise(resolve => {
            this.requests[id] = {resolve: resolve, timer: setTimeout(() => this.answer(id, false, "Timed out"), this.largeTimeout), message: msg.message_id, text: text};
        });
    }

    /**
     * @param {number} id
     * @param {boolean} allowed
     * @param {string} [note]
     * @returns {boolean} false if the request is no longer pending
     */
    static answer(id, allowed, note) {
        var request = this.requests[id];
        if (!request) return false;
        delete this.requests[id];
        clearTimeout(request.timer);
        App.app.telegram.editMessageText(Files.config.admin, request.message, null, `${request.text}\n${allowed ? "Allowed" : note ?? "Denied"}`).catch(() => {});
        request.resolve(allowed);
        return true;
    }
}

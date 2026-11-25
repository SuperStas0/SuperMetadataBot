import { Markup } from "telegraf";

export class Menus {
    /**
     * @param {[string, string, number, ("primary" | "success" | "danger")?][]} buttons
     * @returns {Markup.Markup}
     */
    static GenerateMarkup(...buttons){
        return {...this.GeneratePlain(...buttons), parse_mode: "MarkdownV2"};
    }

    /**
     * @param {[string, string, number, ("primary" | "success" | "danger")?][]} buttons
     */
    static GeneratePlain(...buttons){
        var rows = [];
        buttons.forEach(([name, command, row, style]) => {
            rows[row] ??= [];
            rows[row].push(style ? {...Markup.button.callback(name, command), style: style} : Markup.button.callback(name, command));
        });
        return {...Markup.inlineKeyboard(rows)};
    }

    static Simple = {parse_mode: "MarkdownV2", link_preview_options: {is_disabled: true}};

    static Main = this.GenerateMarkup(["Send", "send", 0], ["Title", "title", 1], ["Performer", "performer", 1], ["Cuts", "cuts", 2], ["Poster", "poster", 2]);

    /**
     * @param {boolean} batched
     */
    static GenerateBatch(batched) {
        return this.GenerateMarkup(["Send", "send", 0], ["Send All", "sendAll", 0], ["Title", "title", 1], ["Performer", "performer", 1], ["Cuts", "cuts", 2], ["Poster", "poster", 2], ["Previous", "prev", 3], ["Next", "next", 3], ["Titles", "titles", 4], ["Order", "order", 4], [batched ? "Unbatch" : "Batch", "batch", 4]);
    }

    static Titles = this.GenerateMarkup(["Skip", "skip", 0], ["Back", "cancel", 1]);

    static Order = this.GenerateMarkup(["Previous", "prev", 0], ["Next", "next", 0], ["Move up", "moveUp", 1], ["Move down", "moveDown", 1], ["To first", "moveFirst", 2], ["To last", "moveLast", 2], ["Back", "cancel", 3]);

    /**
     * @param {number} suggestions
     * @param {number} cuts
     */
    static GenerateCuts(suggestions, cuts) {
        var buttons = [];
        var row = -1;
        for (var index = 0; index < suggestions; index++) {
            if (index % 4 == 0) row++;
            buttons.push([`Apply ${index + 1}`, `cutAdd:${index}`, row]);
        }
        if (suggestions > 1) buttons.push(["Apply all", "cutsAddAll", ++row]);
        for (var index = 0; index < cuts; index++) {
            if (index % 4 == 0) row++;
            buttons.push([`Remove ${index + 1}`, `cutRemove:${index}`, row]);
        }
        if (cuts) buttons.push(["Clear all", "cutsClear", ++row]);
        buttons.push(["Back", "cancel", ++row]);
        return this.GenerateMarkup(...buttons);
    }

    /**
     * @param {number} count
     */
    static GenerateSearch(count) {
        var buttons = Array.from({length: count}, (_, index) => [`${index + 1}`, `search:${index}`, 0]);
        buttons.push(["Cancel", "searchCancel", 1]);
        return this.GenerateMarkup(...buttons);
    }

    static Cancel = this.GenerateMarkup(["Back", "cancel", 0]);

    static DefaultOnly = this.GenerateMarkup(["Set default", "default", 0], ["Back", "cancel", 1]);

    static RemoveOnly = this.GenerateMarkup(["Remove", "null", 0], ["Back", "cancel", 1]);

    static DefaultNRemove = this.GenerateMarkup(["Set default", "default", 0], ["Remove", "null", 1], ["Back", "cancel", 2]);

    static SearchAsk = this.GenerateMarkup(["Yes", "searchYes", 0]);

    static Confirm = this.GenerateMarkup(["Load all", "playlistLoad", 0], ["Cancel", "playlistCancel", 1]);

    /**
     * @param {PosterMode} poster
     * @param {boolean} formatted
     * @param {boolean} uploaded
     */
    static GeneratePoster(poster, formatted, uploaded) {
        var buttons = [];
        if (poster) buttons.push([formatted ? "Unformat" : "Format", "format"]);
        if (poster != "default") buttons.push([uploaded ? "Set original" : "Set youtube", "default"]);
        if (poster) buttons.push(["Remove", "null"]);
        buttons.push(["Back", "cancel"]);
        return this.GenerateMarkup(...buttons.map(([name, command], row) => [name, command, row]));
    }
}

import { Markup } from "telegraf";

export class Menus {
    /**
     * @param {[string, string, number][]} buttons
     * @returns {Markup.Markup}
     */
    static GenerateMarkup(...buttons){
        var rows = [];
        buttons.forEach(([name, command, row]) => {
            rows[row] ??= [];
            rows[row].push(Markup.button.callback(name, command));
        });
        return {...Markup.inlineKeyboard(rows), parse_mode: "MarkdownV2"};
    }

    static Simple = {parse_mode: "MarkdownV2", link_preview_options: {is_disabled: true}};

    static Main = this.GenerateMarkup(["Send", "send", 0], ["Title", "title", 1], ["Performer", "performer", 1], ["Cuts", "cuts", 2], ["Poster", "poster", 2], ["Delete", "delete", 3]);

    static Playlist = this.GenerateMarkup(["Send", "send", 0], ["Title", "title", 1], ["Performer", "performer", 1], ["Cuts", "cuts", 2], ["Poster", "poster", 2], ["Previous", "prev", 3], ["Next", "next", 3], ["Send All", "sendAll", 4]);

    /**
     * @param {number} suggestions
     * @param {number} cuts
     */
    static GenerateCuts(suggestions, cuts) {
        var buttons = [];
        var row = -1;
        for (var index = 0; index < suggestions; index++) {
            if (index % 4 == 0) row++;
            buttons.push([`Add ${index + 1}`, `cutAdd:${index}`, row]);
        }
        if (suggestions > 1) buttons.push(["Add all", "cutsAddAll", ++row]);
        for (var index = 0; index < cuts; index++) {
            if (index % 4 == 0) row++;
            buttons.push([`Remove ${index + 1}`, `cutRemove:${index}`, row]);
        }
        if (cuts) buttons.push(["Clear all", "cutsClear", ++row]);
        buttons.push(["Done", "cancel", ++row]);
        return this.GenerateMarkup(...buttons);
    }

    static Cancel = this.GenerateMarkup(["Cancel", "cancel", 0]);

    static CancelWithNull = this.GenerateMarkup(["Null", "null", 0], ["Cancel", "cancel", 1]);

    static Choice = this.GenerateMarkup(["1", "select", 0]);

    static DefaultOnly = this.GenerateMarkup(["Set default", "default", 0], ["Cancel", "cancel", 1]);

    static RemoveOnly = this.GenerateMarkup(["Remove", "null", 0], ["Cancel", "cancel", 1]);

    static DefaultNRemove = this.GenerateMarkup(["Set default", "default", 0], ["Remove", "null", 1], ["Cancel", "cancel", 2]);

    static Confirm = this.GenerateMarkup(["Load all", "playlistLoad", 0], ["Cancel", "playlistCancel", 1]);

    static PosterDefault = this.GenerateMarkup(["Make square", "square", 0], ["Remove", "null", 1], ["Cancel", "cancel", 2]);

    static PosterDefaultSquare = this.GenerateMarkup(["Make original", "square", 0], ["Remove", "null", 1], ["Cancel", "cancel", 2]);

    static PosterCustom = this.GenerateMarkup(["Make square", "square", 0], ["Set default", "default", 1], ["Remove", "null", 2], ["Cancel", "cancel", 3]);

    static PosterCustomSquare = this.GenerateMarkup(["Make original", "square", 0], ["Set default", "default", 1], ["Remove", "null", 2], ["Cancel", "cancel", 3]);
}

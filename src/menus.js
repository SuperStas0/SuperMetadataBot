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

    static Simple = {parse_mode: "MarkdownV2"};

    static Main = this.GenerateMarkup(["Send", "send", 0], ["Title", "title", 1], ["Performer", "performer", 1], ["Start", "start", 2], ["End", "end", 2], ["Poster", "poster", 3], ["Delete", "delete", 4]);

    static Playlist = this.GenerateMarkup(["Send", "send", 0], ["Title", "title", 1], ["Performer", "performer", 1], ["Poster", "poster", 2], ["Previous", "prev", 3], ["Next", "next", 3], ["Send All", "sendAll", 4]);

    static Cancel = this.GenerateMarkup(["Cancel", "cancel", 0]);

    static CancelWithNull = this.GenerateMarkup(["Null", "null", 0], ["Cancel", "cancel", 1]);

    static Choice = this.GenerateMarkup(["1", "select", 0]);

    static DefaultOnly = this.GenerateMarkup(["Set default", "default", 0], ["Cancel", "cancel", 1]);

    static RemoveOnly = this.GenerateMarkup(["Remove", "null", 0], ["Cancel", "cancel", 1]);

    static DefaultNRemove = this.GenerateMarkup(["Set default", "default", 0], ["Remove", "null", 1], ["Cancel", "cancel", 2]);
}

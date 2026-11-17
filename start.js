import fs from "node:fs";
import readline from "node:readline/promises";
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";

export class Start {
    static configPath = "static/config.json";

    /** @type {readline.Interface} */
    static input;

    static botName = "";

    /**
     * @param {string} text
     */
    static async ask(text) {
        return (await this.input.question(text)).trim();
    }

    /**
     * @param {string} text
     * @param {(value: string) => string | null | Promise<string | null>} check
     */
    static async askValid(text, check) {
        while (true) {
            var value = await this.ask(text);
            var error = await check(value);
            if (!error) return value;
            console.log(error);
        }
    }

    /**
     * @param {string} token
     */
    static async checkToken(token) {
        if (!/^\d+:[A-Za-z0-9_-]{30,}$/.test(token)) return "Invalid format, the token looks like 123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
        try {
            var response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {signal: AbortSignal.timeout(15 * 1000)});
            var info = await response.json();
        }
        catch (error) {
            return `Could not reach Telegram: ${error.message}`;
        }
        if (!info.ok) return "Telegram rejected this token, copy it again from BotFather";
        this.botName = info.result.username;
        console.log(`Bot found: @${this.botName}`);
        return null;
    }

    /**
     * @param {string} value
     */
    static checkApiId(value) {
        return /^\d+$/.test(value) ? null : "api_id is a number";
    }

    /**
     * @param {string} value
     */
    static checkApiHash(value) {
        return /^[0-9a-f]{32}$/i.test(value) ? null : "api_hash is 32 characters of 0-9 and a-f";
    }

    static async askToken() {
        console.log([
            "",
            "Step 1 of 3: bot token",
            "1. Open Telegram and start a chat with BotFather: https://t.me/BotFather",
            "2. Send /newbot",
            "3. Send a name for the bot, then a username that ends with bot",
            "4. Copy the token from the reply, it looks like 123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
        ].join("\n"));
        return await this.askValid("Bot token: ", token => this.checkToken(token));
    }

    static async askApi() {
        console.log([
            "",
            "Step 2 of 3: Telegram API credentials",
            "The bot uses your own account to upload audio over 50 MB, this needs an api_id and an api_hash.",
            "1. Open https://my.telegram.org and log in with your phone number, Telegram sends a code to your Telegram app",
            "2. Click API development tools",
            "3. Fill App title and Short name with anything, for example Metadata, then click Create application",
            "4. Copy App api_id and App api_hash from the page"
        ].join("\n"));
        var apiId = Number(await this.askValid("api_id: ", value => this.checkApiId(value)));
        var apiHash = (await this.askValid("api_hash: ", value => this.checkApiHash(value))).toLowerCase();
        return {apiId: apiId, apiHash: apiHash};
    }

    /**
     * @param {number} apiId
     * @param {string} apiHash
     */
    static async login(apiId, apiHash) {
        console.log([
            "",
            "Step 3 of 3: log in your account",
            "This account becomes the bot admin: no file size limit, no batch limit and the Delete button.",
            "Enter your phone number in international format, then the code Telegram sends to your Telegram app. If you use two-step verification, enter its password too."
        ].join("\n"));
        var client = new TelegramClient(new StringSession(""), apiId, apiHash, {connectionRetries: 5});
        client.setLogLevel("error");
        await client.start({
            phoneNumber: () => this.ask("Phone number (for example +380991234567): "),
            phoneCode: () => this.ask("Login code: "),
            password: () => this.ask("Two-step verification password: "),
            onError: error => {
                console.log(error.errorMessage ?? error.message);
                return error.errorMessage == "API_ID_INVALID";
            }
        })
        var me = await client.getMe();
        var sessionId = client.session.save();
        await client.disconnect();
        console.log(`Logged in as ${me.firstName ?? me.username ?? "your account"}`);
        return {admin: Number(me.id.toString()), sessionId: sessionId};
    }

    /**
     * @param {Record<string, string | number>} config
     */
    static save(config) {
        if (fs.existsSync(this.configPath)) fs.copyFileSync(this.configPath, `${this.configPath}.bak`);
        fs.writeFileSync(`${this.configPath}.tmp`, `${JSON.stringify(config, null, 4)}\n`, {mode: 0o600});
        fs.renameSync(`${this.configPath}.tmp`, this.configPath);
    }

    static async setup() {
        if (!process.stdin.isTTY) throw new Error("Setup needs an interactive terminal");
        this.input = readline.createInterface({input: process.stdin, output: process.stdout});
        try {
            if (fs.existsSync(this.configPath)) {
                console.log(`\nWarning: ${this.configPath} already exists and contains saved settings.`);
                if ((await this.ask(`Overwrite it? The old file is kept as ${this.configPath}.bak (y/N): `)).toLowerCase() != "y") {
                    console.log("Kept the existing settings");
                    return;
                }
            }
            var botToken = await this.askToken();
            var api = await this.askApi();
            var account = await this.login(api.apiId, api.apiHash);
            this.save({admin: account.admin, botToken: botToken, sessionId: account.sessionId, apiId: api.apiId, apiHash: api.apiHash});
            console.log(`\nSaved ${this.configPath}`);
            console.log("Start the bot with: node start.js");
            console.log(`Then open https://t.me/${this.botName} and send /start from the admin account`);
        }
        finally {
            this.input.close();
        }
    }

    static async start() {
        process.chdir(import.meta.dirname);
        var args = process.argv.slice(2);
        var unknown = args.find(arg => arg != "-s");
        if (unknown) throw new Error(`Unknown flag: ${unknown}, usage: node start.js [-s]`);
        if (args.length) {
            await this.setup();
            process.exit(0);
        }
        if (!fs.existsSync(this.configPath)) {
            console.log(`${this.configPath} not found, starting setup`);
            await this.setup();
        }
        await import("./main.js");
    }

    static {
        this.start().catch(error => {
            console.log(error);
            process.exit(1);
        })
    }
}

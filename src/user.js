import { extname } from "path";
import { App }  from "../main.js";
import { Utility } from "./utility.js";
import { Files } from "./files.js";
import { Audio, AudioSource } from "./audio.js";
import { Menus } from "./menus.js";
import { Network } from "./network.js";
import { Log } from "./log.js";
import { History } from "./history.js";
import { Panel } from "./panel.js";


export class User {
    static textLimit = 256;

    static maxPlaylist = 10;

    static maxCuts = 10;

    static batchDelay = 1500;

    static maxSuggestions = 8;

    static categoryNames = {sponsor: "Sponsor", selfpromo: "Self promotion", interaction: "Interaction reminder", intro: "Intro", outro: "Outro", preview: "Preview", music_offtopic: "Non-music", filler: "Filler"};

    /**
     * @param {Context} ctx
     */
    constructor (ctx){
        /** @type {number} */
        this.id = ctx.chat.id;
        /** @type {string} */
        this.name = "";
        this.statusMessage;
        /** @type {UserMode} */
        this.mode = "none";
        /** @type {UserStatus} */
        this.status = "none";
        /** @type {Audio} */
        this.audio = new Audio();
        /** @type {Audio[]} */
        this.playlist = [];
        /** @type {number | null} */
        this.playlistId;
        /** @type {number | null} */
        this.menu;
        /** @type {string[] | null} */
        this.pending = null;
        /** @type {number | null} */
        this.confirm = null;
        /** @type {SearchResult[] | null} */
        this.results = null;
        /** @type {number | null} */
        this.searchMenu = null;
        /** @type {TelegramFile[]} */
        this.incoming = [];
        this.incomingTimer = null;
        /** @type {string | null} */
        this.askQuery = null;
        /** @type {number | null} */
        this.askMenu = null;
    }

    getAudio() {
        return this.mode == "playlist" ? this.playlist[this.playlistId] : this.audio;
    }

    /**
     * @returns {Promise<boolean>}
     */
    async parseLink() {
        this.status = "loading";

        var audio = this.getAudio();
        var id = Utility.getIdFromUrl(audio.source.url);
        audio.source.url = `https://www.youtube.com/watch?v=${id}`;
        var url = audio.source.url;
        var path = this.getSourcePath();
        var admin = this.isAdmin();
        var large = admin || (Files.settings.largeFiles ?? "off") != "off";
        var own = this.getCookies();
        var cookies = null;
        var file;

        var run = async task => {
            var used = cookies;
            try {
                return await task(used);
            }
            catch (error) {
                if (used || !own || !Network.needsCookies(error)) throw error;
                cookies = own;
                return await task(cookies);
            }
        };

        if (!Files.list(path).some(name => name.endsWith(".m4a")) && Files.getFreeSpace() < Network.minFreeSpace) {
            App.clean(true);
            if (Files.getFreeSpace() < Network.minFreeSpace) return this.decline("Not enough free space on the server, try again later");
        }

        this.updateStatus(`Fetching: ${url}`);

        try {
            var fetchFiles = () => Utility.lock(path, async () => {
                var tasks = [];

                Files.createFolder(path);
                if (!Files.exists(Files.path(path, "data.json"))) {
                    var metadata = await Utility.timeout(run(used => Network.fetchInfo(url, used)), Network.infoTimeout, "Fetching info timed out");
                    if (metadata.is_live) throw new Error("Live streams are not supported");
                    if (metadata.duration > Network.maxDuration) throw new Error("Video is too long");
                    Files.saveAudio(path, Object.assign(new AudioSource(), {title: metadata.title, performer: metadata.channel, duration: metadata.duration || 0}));
                }

                var source = Files.loadAudio(path);
                if (large && source.limited) {
                    source.id = null;
                    source.limited = false;
                    Files.saveAudio(path, source);
                }
                var best = Files.path(path, "audio.m4a");
                file = large || Files.exists(best) && Files.getFileSize(best) < Network.botFileLimit ? "audio.m4a" : "audio-limited.m4a";
                if (!Files.exists(Files.path(path, file))) {
                    this.updateStatus(`Downloading: ${url}`);
                    tasks.push(Utility.queue("download", Network.maxDownloads, () => Utility.timeout(run(used => Network.downloadMusic(url, path, large, used)), Network.downloadTimeout, "Downloading timed out")).then(() => this.updateStatus(`Fetching: ${url}`)));
                }
                if (!Files.exists(Files.path(path, "poster.jpg"))) tasks.push(run(used => Network.downloadPoster(url, path, used, metadata?.thumbnails)));

                await Promise.all(tasks);
                Files.touch(Files.path(path, file));
            });
            await fetchFiles();
            var size = () => Files.getFileSize(Files.path(path, file));
            if (!admin && large && size() >= Network.botFileLimit && !await this.allowLarge(Files.loadAudio(path).title, size())) {
                large = false;
                await fetchFiles();
            }
            App.clean(true);

            audio.source = Files.loadAudio(path);
            audio.source.url = url;
            audio.source.file = file;
            audio.performer = audio.source.performer;
            if (audio.poster == "default" && !Files.exists(path, "poster.jpg")) this.setPoster(null, audio);
            if (!large && size() >= Network.botFileLimit) {
                var sent = audio.source.id && await App.app.telegram.sendAudio(this.id, audio.source.id).then(() => true, () => false);
                return sent ? this.decline() : this.decline(`This audio is over the ${Network.botFileLimit / 1024 / 1024} MB limit of this bot. Host your own bot to remove the limit: https://github.com/SuperStas0/SuperMetadata`);
            }
            this.clearStatus();
            var segments = this.mode == "playlist" ? null : this.loadSegments();
            await this.sendSource();
            History.record(this, audio);
            if (segments && await segments && audio.source.segments.length) this.notify(`SponsorBlock: ${audio.source.segments.length} segments found, see Cuts`);
            this.status = "default";
        }
        catch (error) {
            Log.error(`Load ${url} (user ${this.id})`, error);
            if (Network.needsCookies(error)) this.decline(this.getBlockedText());
            else this.decline(`Failed to load: ${url}`);
            return false;
        }
        return true;
    }

    /**
     * @param {string} url
     */
    loadSingle(url) {
        this.removeSearch();
        this.mode = "youtube";
        this.audio = new Audio(url);
        this.setPoster("default");
        this.parseLink().then(() => this.sendMenu("new"));
    }

    /**
     * @param {string} query
     */
    async search(query) {
        if (this.status == "loading") return this.updateStatus("Please wait for previous request to finish");
        if (this.status != "none" && this.status != "default") return;
        var previous = this.status;
        this.status = "loading";
        this.removeSearch();
        this.updateStatus(`Searching: ${query}`);
        try {
            var own = this.getCookies();
            var results = await Utility.timeout(Network.fetchSearch(query).catch(error => {
                if (!own || !Network.needsCookies(error)) throw error;
                return Network.fetchSearch(query, own);
            }), Network.infoTimeout, "Search timed out");
            this.clearStatus();
            this.status = previous;
            if (!results.length) return this.notify(`Nothing found: ${query}`);
            this.results = results;
            var text = results.map((result, index) => `${index + 1}\\. \`${Utility.escapeCode(result.title)}\`\n${Utility.escapeText([result.channel, result.views != null && `${Utility.getViewsString(result.views)} views`, result.duration && Utility.getDurationString(result.duration)].filter(part => part).join(", "))}`).join("\n\n");
            var msg = await App.app.telegram.sendMessage(this.id, text, Menus.GenerateSearch(results.length));
            this.searchMenu = msg.message_id;
        }
        catch (error) {
            Log.error(`Search ${query} (user ${this.id})`, error);
            this.clearStatus();
            this.status = previous;
            this.notify(Network.needsCookies(error) ? this.getBlockedText() : `Search failed: ${query}`);
        }
    }

    /**
     * @param {string} title
     * @param {number} size
     * @returns {Promise<boolean>}
     */
    async allowLarge(title, size) {
        if (this.isAdmin()) return true;
        var mode = Files.settings.largeFiles ?? "off";
        if (mode == "on") return true;
        if (mode != "confirm") return false;
        this.updateStatus(`Waiting for the admin to allow a large file: ${title}`);
        return await Panel.askLarge(this, title, size);
    }

    /**
     * @param {string} text
     */
    async askSearch(text) {
        var query = text.replace(/\s+/g, " ").trim().slice(0, 200);
        if (!query) return;
        this.removeAsk();
        var mode = Files.settings.searchConfirm ?? "on";
        if (mode == "off" || mode == "nonadmin" && this.isAdmin()) return this.search(query);
        this.askQuery = query;
        var msg = await App.app.telegram.sendMessage(this.id, `Search for \`${Utility.escapeCode(query)}\`?`, Menus.SearchAsk);
        this.askMenu = msg.message_id;
    }

    confirmSearch() {
        var query = this.askQuery;
        this.removeAsk();
        if (query) this.search(query);
    }

    removeAsk() {
        if (this.askMenu) App.app.telegram.deleteMessage(this.id, this.askMenu).catch(() => {});
        this.askMenu = null;
        this.askQuery = null;
    }

    /**
     * @param {number} index
     */
    pickResult(index) {
        var result = this.results?.[index];
        if (!result || this.status != "none" && this.status != "default") return;
        this.loadSingle(`https://www.youtube.com/watch?v=${result.id}`);
    }

    removeSearch() {
        if (this.searchMenu) App.app.telegram.deleteMessage(this.id, this.searchMenu).catch(() => {});
        this.searchMenu = null;
        this.results = null;
    }

    /**
     * @param {TelegramFile} file
     */
    loadFile(file) {
        if (this.status == "loading") return this.updateStatus("Please wait for previous request to finish");
        if (this.status != "none" && this.status != "default") return;
        if (file.size > Network.telegramFileLimit) return this.notify(`File is over the ${Network.telegramFileLimit / 1024 / 1024} MB limit for files sent to a bot`);
        this.incoming.push(file);
        clearTimeout(this.incomingTimer);
        this.incomingTimer = setTimeout(() => this.processIncoming(), User.batchDelay);
    }

    processIncoming() {
        var files = this.incoming;
        this.incoming = [];
        if (this.status == "loading") return this.updateStatus("Please wait for previous request to finish");
        if (this.status != "none" && this.status != "default") return;
        if (!this.isAdmin() && files.length > User.maxPlaylist) return this.notify(`Too many files: ${files.length}, send up to ${User.maxPlaylist} at once`);
        if (files.length == 1) this.parseFile(files[0]);
        else if (files.length > 1) this.parseFiles(files);
    }

    /**
     * @param {string} text
     */
    static expected(text) {
        return Object.assign(new Error(text), {user: true});
    }

    /**
     * @param {TelegramFile} file
     */
    static getFileTitle(file) {
        return (file.title || file.name?.replace(/\.[^.]+$/, "") || "Audio").slice(0, User.textLimit);
    }

    /**
     * @param {TelegramFile} file
     * @returns {Promise<AudioSource>}
     */
    async importFile(file) {
        var title = User.getFileTitle(file);
        var performer = file.performer ? file.performer.slice(0, User.textLimit) : null;
        var path = Files.path("downloads", "telegram", file.uniqueId);

        if (!Files.exists(path, "audio.m4a") && Files.getFreeSpace() < Network.minFreeSpace) {
            App.clean(true);
            if (Files.getFreeSpace() < Network.minFreeSpace) throw User.expected("Not enough free space on the server, try again later");
        }

        await Utility.lock(path, async () => {
            var best = Files.path(path, "audio.m4a");
            if (Files.exists(path, "data.json") && Files.exists(best)) return Files.touch(best);

            Files.createFolder(path);
            var link = String(await App.app.telegram.getFileLink(file.id));
            var ext = extname(new URL(link).pathname).toLowerCase();
            if (!/^\.[a-z0-9]{1,5}$/.test(ext)) ext = ".bin";
            var original = Files.path(path, `original${ext}`);
            var temp = Files.path(path, "tmp-audio.m4a");
            try {
                var buffer = await Network.downloadFile(link, Network.telegramFileLimit, Network.fileTimeout);
                if (!buffer) throw new Error("Failed to download the file");
                Files.write(original, buffer);
                var duration;
                try {
                    duration = await Files.importAudio(original, temp, ext == ".m4a");
                }
                catch (error) {
                    if (ext != ".m4a") throw error;
                    duration = await Files.importAudio(original, temp, false);
                }
                if (!duration) throw new Error("Failed to read the audio duration");
                if (duration > Network.maxDuration) throw User.expected("Audio is too long");
                Files.move(temp, best);
                await Files.extractCover(original, Files.path(path, "poster.jpg")).catch(() => {});
                Files.saveAudio(path, Object.assign(new AudioSource(), {title: title, performer: performer, duration: duration}));
            }
            finally {
                Files.tryDelete(original);
                Files.tryDelete(temp);
            }
        })

        var source = Files.loadAudio(path);
        source.url = file.uniqueId;
        source.file = "audio.m4a";
        source.title = title;
        source.performer = performer;
        source.uploaded = true;
        var size = Files.getFileSize(Files.path(path, source.file));
        if (size >= Network.botFileLimit && !await this.allowLarge(title, size)) throw User.expected(`This audio is over the ${Network.botFileLimit / 1024 / 1024} MB limit of this bot. Host your own bot to remove the limit: https://github.com/SuperStas0/SuperMetadata`);
        return source;
    }

    /**
     * @param {AudioSource} source
     * @param {TelegramFile} file
     */
    createAudio(source, file) {
        var audio = new Audio();
        audio.source = source;
        audio.performer = source.performer;
        this.setPoster(Files.exists(source.path, "poster.jpg") ? "default" : null, audio);
        History.record(this, audio, file);
        return audio;
    }

    /**
     * @param {TelegramFile} file
     */
    async parseFile(file) {
        var previous = this.status;
        var title = User.getFileTitle(file);
        this.status = "loading";
        this.updateStatus(`Loading: ${title}`);

        try {
            var source = await this.importFile(file);
            this.removeSearch();
            this.mode = "telegram";
            this.audio = this.createAudio(source, file);
            App.clean(true);
            this.clearStatus();
            this.status = "default";
            await this.sendMenu("new");
        }
        catch (error) {
            if (!error.user) Log.error(`Load file ${title} (user ${this.id})`, error);
            this.fail(previous, error.user ? error.message : `Failed to load: ${title}`);
        }
    }

    /**
     * @param {TelegramFile[]} files
     */
    async parseFiles(files) {
        var previous = this.status;
        var audios = [];
        var failed = [];
        this.status = "loading";

        for (var file of files) {
            var title = User.getFileTitle(file);
            this.updateStatus(`Loading ${audios.length + failed.length + 1}/${files.length}: ${title}`);
            try {
                audios.push(this.createAudio(await this.importFile(file), file));
            }
            catch (error) {
                if (!error.user) Log.error(`Load file ${title} (user ${this.id})`, error);
                failed.push(error.user ? `${title}: ${error.message}` : title);
            }
        }

        if (!audios.length) return this.fail(previous, `Failed to load: ${failed.join(", ")}`);
        if (failed.length) this.notify(`Failed to load: ${failed.join(", ")}`);
        this.removeSearch();
        this.mode = "playlist";
        this.playlist = audios;
        this.playlistId = 0;
        App.clean(true);
        this.clearStatus();
        this.status = "default";
        await this.sendMenu("new");
    }

    /**
     * @param {UserStatus} status
     * @param {string} text
     */
    fail(status, text) {
        this.clearStatus();
        this.status = status;
        return this.notify(text);
    }

    hasDefaultPoster() {
        return Files.exists(this.getAudio().source.path, "poster.jpg");
    }

    /**
     * @param {string} [text]
     */
    decline(text) {
        this.clearStatus();
        this.status = "none";
        if (text) App.app.telegram.sendMessage(this.id, text).catch(() => {});
        return false;
    }

    async send() {
        if (this.status != "default") return;

        var audio = this.getAudio();
        var source = audio.source;
        var title = audio.title ?? source.title;
        var path = this.getUserPath();
        var audioPath = Files.path(path, `${Utility.getFileName(title)}.m4a`);
        var duration = Utility.getDuration(source.duration, audio.cuts);

        this.status = "loading";
        this.updateStatus(`Uploading: ${title}`);
        this.removeMenu();

        try {
            if (audio.cuts.length) await Files.cut(Files.path(source.path, source.file), audioPath, Utility.getKept(audio.cuts, source.duration));
            else Files.copy(Files.path(source.path, source.file), audioPath);

            var poster = audio.poster && await this.getPosterFile();
            await Network.uploadFile(this.id, audioPath, {title: title, performer: audio.performer, duration: duration, thumbnail: poster && {source: poster}});
            History.update(audio);
        }
        catch (error) {
            Log.error(`Send ${title} (user ${this.id})`, error);
            App.app.telegram.sendMessage(this.id, `Failed to send: ${title}`).catch(() => {});
        }
        Files.delete(audioPath);

        this.status = "default";
        this.clearStatus();
        await this.sendMenu();

    }

    async sendSource() {
        var source = this.getAudio().source;

        if (source.id) {
            try {
                await App.app.telegram.sendAudio(this.id, source.id);
                return;
            }
            catch (error) {
                Log.error(`Send source (user ${this.id})`, error);
            }
        }
        this.updateStatus(`Uploading: ${source.title}`);
        var msg = await Network.uploadFile(this.id, Files.path(source.path, source.file), {title: source.title, performer: source.performer, duration: source.duration, thumbnail: Files.exists(source.path, "poster.jpg") ? {source: Files.path(source.path, "poster.jpg")} : undefined});
        source.id = msg.audio.file_id;
        source.limited = source.file != "audio.m4a";
        Files.saveAudio(source.path, source);
        this.clearStatus();
    }

    async parsePlaylist() {
        this.playlistId = 0;
        while (this.playlistId < this.playlist.length) {
            this.setPoster("default");
            if (await this.parseLink()) this.playlistId++;
            else this.playlist.splice(this.playlistId, 1);
        }
        this.status = this.playlist.length ? "default" : "none";
        this.playlistId = 0;
        await this.sendMenu("new");
    }

    async sendPlaylist() {
        if (this.mode != "playlist" || this.status != "default") return;
        var last = this.playlistId;
        this.playlistId = 0;
        for (var _ of this.playlist) {
            await this.send();
            this.playlistId += 1;
        }
        this.playlistId = last;
        await this.sendMenu();
    }

    /**
     * @param {"new" | "default" | "title" | "performer" | "poster" | "cuts"} [mode]
     */
    async sendMenu(mode) {
        if (this.status == "loading" || this.status == "none") return;
        if (!mode) mode = "new";

        this.clearStatus();
        var audio = this.getAudio();
        if (mode == "cuts") {
            await this.loadSegments();
            if (this.status == "loading" || this.status == "none") return;
        }
        var menuText = this.getMenuText(mode).replaceAll(".", "\\.").replaceAll("-", "\\-");
        this.status = mode;

        if (mode == "new") {
            this.removeMenu();
            this.status = "default";
            var msg = await App.app.telegram.sendMessage(this.id, menuText, this.getMainMenu());
            this.menu = msg.message_id;
        }
        else if (mode == "default") await this.editMenu(menuText, this.getMainMenu());
        else if (mode == "title") this.editMenu(menuText, Menus.Cancel);
        else if (mode == "performer") this.editMenu(menuText, audio.performer ? (audio.performer == audio.source.performer ? Menus.RemoveOnly : Menus.DefaultNRemove) : Menus.DefaultOnly);
        else if (mode == "poster") {
            if (audio.poster) {
                this.removeMenu();
                var poster = audio.posterId;
                if (audio.poster == "default") poster = audio.source.posterId ?? {source: Files.path(audio.source.path, "poster.jpg")};
                if (audio.posterSquare) poster = {source: await this.getPosterFile()};
                var markup = audio.poster == "default" ? (audio.posterSquare ? Menus.PosterDefaultSquare : Menus.PosterDefault) : (audio.posterSquare ? Menus.PosterCustomSquare : Menus.PosterCustom);
                var msg = await App.app.telegram.sendPhoto(this.id, poster, {...markup, caption: menuText});
                this.menu = msg.message_id;
                if (audio.poster == "default" && !audio.source.posterId && !audio.posterSquare) {
                    audio.source.posterId = msg.photo.toReversed()[0].file_id;
                    Files.saveAudio(audio.source.path, audio.source);
                }
            }
            else {
                try {
                    await App.app.telegram.editMessageText(this.id, this.menu, null, menuText, Menus.DefaultOnly);
                }
                catch (error) {
                    if (!error.response?.description?.includes("no text in the message to edit")) Log.error(`Menu ${mode} (user ${this.id})`, error);
                    this.removeMenu();
                    var msg = await App.app.telegram.sendMessage(this.id, menuText, Menus.DefaultOnly);
                    this.menu = msg.message_id;
                }
            }
        }
        else if (mode == "cuts") this.editMenu(menuText, Menus.GenerateCuts(this.getSuggestions().length, audio.cuts.length));
    }

    /**
     * @returns {Promise<boolean>}
     */
    async loadSegments() {
        var source = this.getAudio().source;
        if (source.segments) return true;
        var id = source.url && Utility.getIdFromUrl(source.url);
        try {
            source.segments = id ? await Network.fetchSegments(id, source.duration) : [];
            return true;
        }
        catch (error) {
            Log.error(`SponsorBlock ${source.url} (user ${this.id})`, error);
            return false;
        }
    }

    getSuggestions() {
        var audio = this.getAudio();
        return (audio.source.segments ?? []).filter(segment => !audio.cuts.some(([start, end]) => start <= segment.start && end >= segment.end)).slice(0, User.maxSuggestions);
    }

    /**
     * @param {Cut[]} cuts
     */
    applyCuts(cuts) {
        if (this.status != "cuts") return;
        var audio = this.getAudio();
        var merged = Utility.mergeCuts(cuts);
        if (merged.length > User.maxCuts) return this.updateStatus(`Too many cuts, up to ${User.maxCuts} are allowed`);
        if (!Utility.getKept(merged, audio.source.duration).length) return this.updateStatus("Cuts cannot cover the whole audio");
        audio.cuts = merged;
        this.clearStatus();
        this.sendMenu("cuts");
    }

    /**
     * @param {number | null} index
     */
    addSuggested(index) {
        var suggestions = this.getSuggestions();
        var chosen = index == null ? suggestions : suggestions.slice(index, index + 1);
        if (this.status != "cuts" || !chosen.length) return;
        this.applyCuts([...this.getAudio().cuts, ...chosen.map(segment => [segment.start, segment.end])]);
    }

    /**
     * @param {number} index
     */
    removeCut(index) {
        this.applyCuts(this.getAudio().cuts.filter((_, position) => position != index));
    }

    getMainMenu() {
        return this.mode == "playlist" ? Menus.Playlist : Menus.Main;
    }

    /**
     * @param {string} text
     * @param {any} markup
     */
    async editMenu(text, markup) {
        try {
            await App.app.telegram.editMessageText(this.id, this.menu, null, text, markup);
        }
        catch (error) {
            if (!error.response?.description?.includes("message is not modified")) Log.error(`Edit menu (user ${this.id})`, error);
        }
    }

    getAudios() {
        return this.mode == "playlist" ? this.playlist : [this.audio];
    }

    /**
     * @param {string | null} performer
     */
    setPerformer(performer) {
        for (var audio of this.getAudios()) audio.performer = performer;
    }

    resetPerformer() {
        for (var audio of this.getAudios()) audio.performer = audio.source.performer;
    }

    /**
     * @param {"default"| {} & string | null} mode
     */
    applyPoster(mode) {
        for (var audio of this.getAudios()) this.setPoster(mode == "default" && !Files.exists(audio.source.path, "poster.jpg") ? null : mode, audio);
    }

    /**
     * @param {"default"| {} & string | null} mode
     * @param {Audio} [audio]
     */
    setPoster(mode, audio = this.getAudio()) {
        if (!mode) audio.poster = null;
        else if (mode == "default") {
            audio.poster = "default";
            audio.posterSquare = !audio.source.uploaded;
        }
        else {
            audio.poster = "custom";
            audio.posterId = mode;
            audio.posterSquare = false;
        }

    }

    /**
     * @param {string} fileId
     */
    async setCustomPoster(fileId) {
        var fileLink = await App.app.telegram.getFileLink(fileId).catch(() => null);
        if (!fileLink || !await Network.downloadImage(fileLink, this.getPosterPath()).catch(() => false)) return this.updateStatus("Failed to download poster");
        this.clearStatus();
        Files.delete(this.getPosterPath().replace(/\.jpg$/, "-square.jpg"));
        this.applyPoster(fileId);
        this.sendMenu("poster");
    }

    removeMenu() {
        if (!this.menu) return;
        App.app.telegram.deleteMessage(this.id, this.menu).catch(() => {});
        this.menu = null;
    }

    isAdmin() {
        return this.id == Files.config.admin;
    }

    /**
     * @param {string} text
     */
    notify(text) {
        return App.app.telegram.sendMessage(this.id, text).catch(() => {});
    }

    getCookies() {
        if (this.hasCookies()) return this.getCookiesPath();
        if (!Files.settings.shareCookies || this.isAdmin()) return null;
        var shared = Files.path("downloads", "users", String(Files.config.admin), "cookies.txt");
        return Files.exists(shared) ? shared : null;
    }

    hasCookies() {
        return Files.exists(this.getCookiesPath());
    }

    /**
     * @param {{file_id: string, file_size?: number}} document
     */
    async setCookies(document) {
        if (document.file_size > Network.cookiesFileLimit) return this.notify("Cookies file is too big");
        try {
            var link = await App.app.telegram.getFileLink(document.file_id);
            var buffer = await Network.downloadFile(link, Network.cookiesFileLimit);
            if (!buffer) return this.notify("Failed to download the cookies file");
            var cookies = Utility.parseCookies(buffer.toString("utf8"));
            if (!cookies) return this.notify("No YouTube cookies found in the file, send cookies.txt in Netscape format");
            var path = this.getCookiesPath();
            Files.write(`${path}.tmp`, cookies, 0o600);
            Files.move(`${path}.tmp`, path);
            this.notify("Cookies saved");
        }
        catch (error) {
            Log.error(`Save cookies (user ${this.id})`, error);
            this.notify("Failed to save cookies");
        }
    }

    removeCookies() {
        if (!this.hasCookies()) return this.notify("No cookies saved");
        Files.delete(this.getCookiesPath());
        this.notify("Cookies removed");
    }

    /**
     * @param {string} message
     */
    updateStatus(message) {
        if (this.statusMessage) return this.statusMessage.then(msg => App.app.telegram.editMessageText(this.id, msg.message_id, null, message)).catch(() => {});
        this.statusMessage = App.app.telegram.sendMessage(this.id, message);
    }

    clearStatus() {
        if (!this.statusMessage) return;
        this.statusMessage.then(msg => App.app.telegram.deleteMessage(this.id, msg.message_id)).catch(() => {});
        this.statusMessage = null;
    }

    /**
     * @param {string[]} lists
     * @param {string[]} urls
     */
    async parseLists(lists, urls) {
        this.status = "loading";
        this.removeConfirm();
        this.updateStatus(`Fetching playlist: ${lists[0]}`);

        try {
            var ids = new Set(urls.map(url => Utility.getIdFromUrl(url)));
            var title = null;
            for (var list of lists) {
                var playlist = await Utility.timeout(this.fetchList(list), Network.playlistTimeout, "Fetching playlist timed out");
                if (lists.length == 1) title = playlist.title;
                playlist.ids.forEach(id => ids.add(id));
            }
            if (ids.size == 0) return this.decline("No videos found");
            if (!this.isAdmin() && ids.size > User.maxPlaylist) return this.decline(`Too many videos: ${ids.size}, send up to ${User.maxPlaylist} at once`);

            this.pending = [...ids].map(id => `https://www.youtube.com/watch?v=${id}`);
            var text = `${title ? `Playlist: \`${Utility.escapeCode(title)}\`\n` : ""}Videos: ${ids.size}\nThis may take a long time, confirm to load them all`;
            this.clearStatus();
            this.status = "none";
            var msg = await App.app.telegram.sendMessage(this.id, text, Menus.Confirm);
            this.confirm = msg.message_id;
        }
        catch (error) {
            Log.error(`Playlist ${lists[0]} (user ${this.id})`, error);
            this.decline(Network.needsCookies(error) ? this.getBlockedText() : `Failed to load: ${lists[0]}`);
        }
    }

    /**
     * @param {string} url
     */
    async fetchList(url) {
        var own = this.getCookies();
        try {
            return await Network.fetchPlaylist(url);
        }
        catch (error) {
            if (!own || !Network.needsCookies(error)) throw error;
            return await Network.fetchPlaylist(url, own);
        }
    }

    loadPending() {
        if (!this.pending || this.status == "loading") return;
        var urls = this.pending;
        this.removeConfirm();
        this.mode = "playlist";
        this.playlist = urls.map(url => new Audio(url));
        this.parsePlaylist();
    }

    removeConfirm() {
        if (this.confirm) App.app.telegram.deleteMessage(this.id, this.confirm).catch(() => {});
        this.confirm = null;
        this.pending = null;
    }

    getBlockedText() {
        return this.hasCookies() ? "YouTube rejected your cookies. Send new cookies, see /cookies" : "YouTube blocked this request. Send your YouTube cookies and try again, see /cookies";
    }

    async getPosterFile() {
        var audio = this.getAudio();
        var path = audio.poster == "default" ? Files.path(audio.source.path, "poster.jpg") : this.getPosterPath();
        if (!audio.posterSquare) return path;
        var squarePath = path.replace(/\.jpg$/, "-square.jpg");
        if (!Files.exists(squarePath)) await Files.square(path, squarePath);
        return squarePath;
    }

    async toggleSquare() {
        var audio = this.getAudio();
        if (this.status != "poster" || !audio.poster) return;
        var value = !audio.posterSquare;
        var changed = this.getAudios().filter(item => item.poster);
        var previous = changed.map(item => item.posterSquare);
        changed.forEach(item => item.posterSquare = value);
        try {
            if (value) await this.getPosterFile();
        }
        catch (error) {
            Log.error(`Square poster (user ${this.id})`, error);
            changed.forEach((item, index) => item.posterSquare = previous[index]);
            return this.updateStatus("Failed to make the poster square");
        }
        this.sendMenu("poster");
    }

    getSourcePath() {
        var source = this.getAudio()?.source;
        if (!source?.url) return;
        return Files.path("downloads", this.mode == "playlist" ? "youtube" : this.mode, this.mode == "telegram" ? source.url : Utility.getIdFromUrl(source.url));
    }

    getUserPath() {
        return Files.path("downloads", "users", this.id.toString());
    }

    getCookiesPath() {
        return Files.path(this.getUserPath(), "cookies.txt");
    }

    getPosterPath() {
        return Files.path(this.getUserPath(), this.mode == "playlist" ? "poster-batch.jpg" : "poster.jpg");
    }

    getInfo() {
        var audio = this.getAudio();
        var info = {};

        /** @type {string} */
        info.title = Utility.escapeCode(audio.title ?? audio.source.title);
        info.performer = Utility.escapeCode(audio.performer);
        info.duration = audio.source.duration;
        info.poster = audio.poster;
        info.cuts = audio.cuts;

        info.text = "";
        if (this.mode == "playlist") info.text += `\`${this.playlistId+1}/${this.playlist.length}\`\n`;
        info.text += `Title: \`${info.title}\`\n`;
        info.text += info.performer ? `Performer: \`${info.performer}\`\n` : "No performer\n";
        info.text += `Duration: \`${Utility.getDurationString(info.duration)}\`\n`;
        info.text += info.poster ? `Poster: ${{"default": audio.source.uploaded ? "Original" : "Youtube", "custom": "Custom"}[info.poster]}${audio.posterSquare ? ", square" : ""}` : "No poster";
        if (info.cuts.length) info.text += `\nCuts: ${info.cuts.length}, new duration \`${Utility.getDurationString(Utility.getDuration(info.duration, info.cuts))}\``;

        return info;

    }

    /**
     * @param {"new" | "default" | "title" | "performer" | "poster" | "cuts"} mode
     */
    getMenuText(mode) {
        var info = this.getInfo();
        if (mode == "new" || mode == "default") return info.text;
        if (mode == "title") return `Current title: \`${info.title}\`\nSend new title`;
        if (mode == "performer") return info.performer ? `Current performer: \`${info.performer}\`\nSend new performer` : `Currently no performer\nSend new performer`;
        if (mode == "poster") return info.poster ? `Current poster\nSend new poster` : `Currently no poster\nSend new poster`;
        if (mode == "cuts") {
            var format = ([start, end]) => `\`${Utility.getDurationString(start)}\` - \`${Utility.getDurationString(end)}\``;
            var suggestions = this.getSuggestions();
            var lines = [info.cuts.length ? "Cuts:" : "No cuts"];
            info.cuts.forEach((cut, index) => lines.push(`${index + 1}. ${format(cut)}`));
            if (suggestions.length) lines.push("Suggested by SponsorBlock:");
            suggestions.forEach((segment, index) => lines.push(`${index + 1}. ${format([segment.start, segment.end])} ${User.categoryNames[segment.category]}`));
            lines.push("Send a range to cut out, for example 1:30 - 2:45, one range per line. Leave a side empty for the edge of the audio, for example 1:30 -");
            return lines.join("\n");
        }
    }

    /**
     * @param {Context} ctx
     */
    static getName(ctx) {
        var name = [ctx.from?.first_name, ctx.from?.last_name].filter(part => part).join(" ");
        return ctx.from?.username ? `${name} (@${ctx.from.username})` : name;
    }

    /**
     * @param {Context} ctx
     * @returns {User}
     */
    static getUser(ctx) {
        var id = ctx.chat.id;
        if (!App.data[id]) {
            App.data[id] = new User(ctx);
            Files.createFolder(App.data[id].getUserPath());
        }
        App.data[id].name = User.getName(ctx);
        return App.data[id];
    }
}

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

    static categoryNames = {sponsor: "Sponsor", selfpromo: "Self promotion", interaction: "Interaction reminder", intro: "Intro", outro: "Outro", preview: "Preview", music_offtopic: "Non-music", filler: "Filler", silence: "Silence"};

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
        /** @type {boolean} the confirmed search sets the poster instead of listing the results */
        this.askPoster = false;
        /** @type {number | null} */
        this.askMenu = null;
        /** @type {AbortController | null} */
        this.controller = null;
        /** @type {(() => void) | null} */
        this.onCancel = null;
        /** @type {number} position in the batch to return to after setting titles */
        this.titleReturn = 0;
        /** @type {boolean} performer and poster changes apply to the whole batch */
        this.batched = true;
    }

    /**
     * @param {() => void} onCancel restores the state if the action is cancelled
     * @returns {AbortSignal}
     */
    startAction(onCancel) {
        this.controller = new AbortController();
        this.onCancel = onCancel;
        return this.controller.signal;
    }

    cancel() {
        clearTimeout(this.incomingTimer);
        var dropped = this.incoming.length > 0;
        this.incoming = [];
        if (this.status == "loading" && this.controller) {
            var onCancel = this.onCancel;
            this.controller.abort();
            this.controller = null;
            this.onCancel = null;
            onCancel?.();
            return this.notify("Cancelled");
        }
        if (["title", "performer", "poster", "cuts", "titles", "order"].includes(this.status)) return this.back();
        if (!dropped && !this.askQuery && !this.results && !this.confirm) return this.notify("Nothing to cancel");
        this.removeAsk();
        this.removeSearch();
        this.removeConfirm();
        return this.notify("Cancelled");
    }

    back() {
        if (this.status == "titles") this.playlistId = this.titleReturn;
        return this.sendMenu(this.status == "cuts" || this.status == "poster" && this.getAudio().poster ? "new" : "default");
    }

    startTitles() {
        if (this.mode != "playlist" || this.status != "default") return;
        this.titleReturn = this.playlistId;
        this.playlistId = 0;
        this.sendMenu("titles");
    }

    nextTitle() {
        if (this.status != "titles") return;
        if (this.playlistId + 1 >= this.playlist.length) return this.back();
        this.playlistId += 1;
        this.sendMenu("titles");
    }

    toggleBatch() {
        if (this.mode != "playlist" || this.status != "default") return;
        this.batched = !this.batched;
        this.sendMenu("default");
    }

    startOrder() {
        if (this.mode != "playlist" || this.status != "default") return;
        this.sendMenu("order");
    }

    /**
     * @param {number} to new position of the selected audio
     */
    moveCurrent(to) {
        if (this.status != "order") return;
        to = Math.max(0, Math.min(this.playlist.length - 1, to));
        if (to == this.playlistId) return;
        this.moveTo(this.playlistId, to);
        this.sendMenu("order");
    }

    /**
     * @param {number} from
     * @param {number} to
     */
    moveTo(from, to) {
        var [audio] = this.playlist.splice(from, 1);
        this.playlist.splice(to, 0, audio);
        this.playlistId = to;
    }

    /**
     * @param {string} text moves as "from to", one per line, positions start from 1
     * @returns {string | null} error text
     */
    applyMoves(text) {
        var count = this.playlist.length;
        var moves = text.split(/\r?\n/).map(line => line.trim()).filter(line => line).map(line => line.match(/^(\d+)(?:\s*(?:>|-|to)\s*|\s+)(\d+)$/)?.slice(1).map(Number));
        if (!moves.length || moves.some(move => !move || move.some(position => position < 1 || position > count))) return `Send the position of an audio and its new position, for example 5 2, from 1 to ${count}`;
        moves.forEach(([from, to]) => this.moveTo(from - 1, to - 1));
        this.sendMenu("order");
        return null;
    }

    scanSilences() {
        var current = this.getAudio();
        [current, ...this.getAudios().filter(audio => audio != current)].forEach(audio => audio.source.path && this.scanAudio(audio));
    }

    /**
     * @param {Audio} audio
     */
    async scanAudio(audio) {
        var had = this.getSuggestions(audio).length > 0;
        await this.loadSilences(audio.source);
        if (!had && this.status == "default" && this.menu && this.getAudio() == audio && this.getSuggestions().length) this.sendMenu("default");
    }

    restoreMenu() {
        this.status = "default";
        this.clearStatus();
        this.sendMenu("new");
    }

    /**
     * @param {string} text
     * @param {AbortSignal} signal
     * @param {string} [doneText] shown once instead of the percent when the work reaches 100%
     * @returns {(fraction: number) => void} shows the percent under the text, at most every 1.5 seconds
     */
    progress(text, signal, doneText) {
        var shown = -1;
        var time = 0;
        var done = false;
        return fraction => {
            if (signal.aborted || done) return;
            if (fraction >= 1) {
                done = true;
                if (doneText) this.updateStatus(doneText);
                return;
            }
            var percent = Math.floor(fraction * 100);
            if (!(percent > shown) || Date.now() - time < 1500) return;
            shown = percent;
            time = Date.now();
            this.updateStatus(`${text}\n${percent}%`);
        };
    }

    getAudio() {
        return this.mode == "playlist" ? this.playlist[this.playlistId] : this.audio;
    }

    /**
     * @param {AbortSignal} [signal] of the action that loads several audios
     * @returns {Promise<boolean>}
     */
    async parseLink(signal) {
        this.status = "loading";
        signal ??= this.startAction(() => this.decline());

        var audio = this.getAudio();
        var id = Utility.getIdFromUrl(audio.source.url);
        audio.source.url = `https://www.youtube.com/watch?v=${id}`;
        var url = audio.source.url;
        var path = this.getSourcePath();
        var admin = this.isAdmin();
        var large = admin || Files.getSetting("largeFiles") != "off";
        var cookies = null;
        var file;

        var run = async task => cookies ? await task(cookies) : await this.withCookies(async used => {
            if (used) cookies = used;
            return await task(used);
        }, url, signal);

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
                    tasks.push(Utility.queue("download", Network.maxDownloads, () => Utility.timeout(run(used => Network.downloadMusic(url, path, large, used, this.progress(`Downloading: ${url}`, signal, `Converting: ${url}`), signal)), Network.downloadTimeout, "Downloading timed out")).then(() => {
                        if (!signal.aborted) this.updateStatus(`Fetching: ${url}`);
                    }));
                }
                if (!Files.exists(Files.path(path, "poster.jpg"))) tasks.push(run(used => Network.downloadPoster(url, path, used, metadata?.thumbnails)));

                await Promise.all(tasks);
                signal.throwIfAborted();
                Files.touch(Files.path(path, file));
            });
            await Utility.abortable(fetchFiles(), signal);
            var size = () => Files.getFileSize(Files.path(path, file));
            if (!admin && large && size() >= Network.botFileLimit && !await this.allowLarge(Files.loadAudio(path).title, size(), signal)) {
                large = false;
                await Utility.abortable(fetchFiles(), signal);
            }
            signal.throwIfAborted();
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
            this.loadSegments(audio.source);
            await this.sendSource(signal);
            signal.throwIfAborted();
            History.record(this, audio);
            this.status = "default";
        }
        catch (error) {
            if (signal.aborted) return false;
            var reason = Network.needsCookies(error) ? null : Network.unavailableReason(error);
            if (!reason) {
                if (/requested format is not available/i.test(error.message)) error.stack += `\n${await Network.describeFormats(url)}`;
                Log.error(`Load ${url} (user ${this.id})`, error);
            }
            if (Network.needsCookies(error)) this.decline(this.getBlockedText(error));
            else this.decline(reason ? `Failed to load: ${url}\n${reason}` : `Failed to load: ${url}`);
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
        var signal = this.startAction(() => {
            this.clearStatus();
            this.status = previous;
        });
        this.status = "loading";
        this.removeSearch();
        this.updateStatus(`Searching: ${query}`);
        try {
            var results = await Utility.abortable(Utility.timeout(this.withCookies(cookies => Network.fetchSearch(query, cookies), query, signal), Network.infoTimeout, "Search timed out"), signal);
            this.clearStatus();
            this.status = previous;
            if (!results.length) return this.notify(`Nothing found: ${query}`);
            this.results = results;
            var text = results.map((result, index) => `${index + 1}\\. \`${Utility.escapeCode(result.title)}\`\n${Utility.escapeText([result.channel, result.views != null && `${Utility.getViewsString(result.views)} views`, result.duration && Utility.getDurationString(result.duration)].filter(part => part).join(", "))}`).join("\n\n");
            var msg = await App.app.telegram.sendMessage(this.id, text, Menus.GenerateSearch(results.length));
            this.searchMenu = msg.message_id;
        }
        catch (error) {
            if (signal.aborted) return;
            Log.error(`Search ${query} (user ${this.id})`, error);
            this.clearStatus();
            this.status = previous;
            this.notify(Network.needsCookies(error) ? this.getBlockedText(error) : `Search failed: ${query}`);
        }
    }

    /**
     * @param {string} title
     * @param {number} size
     * @param {AbortSignal} [signal]
     * @returns {Promise<boolean>}
     */
    async allowLarge(title, size, signal) {
        if (this.isAdmin()) return true;
        var mode = Files.getSetting("largeFiles");
        if (mode == "on") return true;
        if (mode != "confirm") return false;
        this.updateStatus(`Waiting for the admin to allow a large file: ${title}`);
        return await Panel.askLarge(this, title, size, signal);
    }

    /**
     * @param {string} text
     * @param {boolean} [poster] the first result becomes the poster
     */
    async askSearch(text, poster = false) {
        var query = text.replace(/\s+/g, " ").trim().slice(0, 200);
        if (!query) return;
        this.removeAsk();
        var mode = Files.getSetting("searchConfirm");
        if (mode == "off" || mode == "nonadmin" && this.isAdmin()) return poster ? this.searchPoster(query) : this.search(query);
        this.askQuery = query;
        this.askPoster = poster;
        var msg = await App.app.telegram.sendMessage(this.id, `Search for \`${Utility.escapeCode(query)}\`?`, Menus.SearchAsk);
        this.askMenu = msg.message_id;
    }

    confirmSearch() {
        var query = this.askQuery;
        var poster = this.askPoster;
        this.removeAsk();
        if (!query) return;
        if (poster) this.searchPoster(query);
        else this.search(query);
    }

    removeAsk() {
        if (this.askMenu) App.app.telegram.deleteMessage(this.id, this.askMenu).catch(() => {});
        this.askMenu = null;
        this.askQuery = null;
        this.askPoster = false;
    }

    /**
     * @param {string} query
     */
    async searchPoster(query) {
        if (this.status != "poster") return;
        var signal = this.startAction(() => {
            this.clearStatus();
            this.status = "poster";
        });
        this.status = "loading";
        this.updateStatus(`Searching: ${query}`);
        try {
            var results = await Utility.abortable(Utility.timeout(this.withCookies(cookies => Network.fetchSearch(query, cookies), query, signal), Network.infoTimeout, "Search timed out"), signal);
            this.clearStatus();
            this.status = "poster";
            if (!results.length) return this.notify(`Nothing found: ${query}`);
            await this.setLinkPoster(`https://www.youtube.com/watch?v=${results[0].id}`);
        }
        catch (error) {
            if (signal.aborted) return;
            Log.error(`Search poster ${query} (user ${this.id})`, error);
            this.clearStatus();
            this.status = "poster";
            this.notify(Network.needsCookies(error) ? this.getBlockedText(error) : `Search failed: ${query}`);
        }
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
     * @param {string} path of the poster, nothing is loaded if it exists
     */
    async importThumbnail(file, path) {
        if (!file.thumbnailId || Files.exists(path)) return;
        var link = await App.app.telegram.getFileLink(file.thumbnailId).catch(() => null);
        if (link) await Network.downloadImage(String(link), path, Network.posterFileLimit).catch(error => Log.error(`Load thumbnail (user ${this.id})`, error));
    }

    /**
     * @param {TelegramFile} file
     * @param {AbortSignal} signal
     * @param {string} [counter] position in a batch for the status text
     * @returns {Promise<AudioSource>}
     */
    async importFile(file, signal, counter = "") {
        var title = User.getFileTitle(file);
        var performer = file.performer ? file.performer.slice(0, User.textLimit) : null;
        var path = Files.path("downloads", "telegram", file.uniqueId);

        if (!Files.exists(path, "audio.m4a") && Files.getFreeSpace() < Network.minFreeSpace) {
            App.clean(true);
            if (Files.getFreeSpace() < Network.minFreeSpace) throw User.expected("Not enough free space on the server, try again later");
        }

        await Utility.abortable(Utility.lock(path, async () => {
            var best = Files.path(path, "audio.m4a");
            var poster = Files.path(path, "poster.jpg");
            if (Files.exists(path, "data.json") && Files.exists(best)) {
                await this.importThumbnail(file, poster);
                return Files.touch(best);
            }

            Files.createFolder(path);
            var link = String(await App.app.telegram.getFileLink(file.id));
            var ext = extname(new URL(link).pathname).toLowerCase();
            if (!/^\.[a-z0-9]{1,5}$/.test(ext)) ext = ".bin";
            var original = Files.path(path, `original${ext}`);
            var temp = Files.path(path, "tmp-audio.m4a");
            try {
                var buffer = await Network.downloadFile(link, Network.telegramFileLimit, Network.fileTimeout, this.progress(`Downloading${counter}: ${title}`, signal), signal);
                if (!buffer) throw new Error("Failed to download the file");
                Files.write(original, buffer);
                var duration;
                try {
                    duration = await Files.importAudio(original, temp, ext == ".m4a", signal, this.progress(`Converting${counter}: ${title}`, signal));
                }
                catch (error) {
                    if (ext != ".m4a" || signal.aborted) throw error;
                    duration = await Files.importAudio(original, temp, false, signal, this.progress(`Converting${counter}: ${title}`, signal));
                }
                if (!duration) throw new Error("Failed to read the audio duration");
                if (duration > Network.maxDuration) throw User.expected("Audio is too long");
                Files.move(temp, best);
                await Files.extractCover(original, poster).catch(() => {});
                await this.importThumbnail(file, poster);
                Files.saveAudio(path, Object.assign(new AudioSource(), {title: title, performer: performer, duration: duration}));
            }
            finally {
                Files.tryDelete(original);
                Files.tryDelete(temp);
            }
        }), signal)
        signal.throwIfAborted();

        var source = Files.loadAudio(path);
        source.url = file.uniqueId;
        source.file = "audio.m4a";
        source.title = title;
        source.performer = performer;
        source.uploaded = true;
        var size = Files.getFileSize(Files.path(path, source.file));
        if (size >= Network.botFileLimit && !await this.allowLarge(title, size, signal)) throw User.expected(`This audio is over the ${Network.botFileLimit / 1024 / 1024} MB limit of this bot. Host your own bot to remove the limit: https://github.com/SuperStas0/SuperMetadata`);
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
        audio.sourceMessage = file.messageId ?? null;
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
        var signal = this.startAction(() => {
            this.clearStatus();
            this.status = previous;
        });
        this.status = "loading";
        this.updateStatus(`Loading: ${title}`);

        try {
            var source = await this.importFile(file, signal);
            this.removeSearch();
            this.mode = "telegram";
            this.audio = this.createAudio(source, file);
            App.clean(true);
            this.clearStatus();
            this.status = "default";
            await this.sendMenu("new");
        }
        catch (error) {
            if (signal.aborted) return;
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
        var signal = this.startAction(() => {
            this.clearStatus();
            this.status = previous;
        });
        this.status = "loading";

        for (var file of files) {
            var title = User.getFileTitle(file);
            var counter = ` ${audios.length + failed.length + 1}/${files.length}`;
            this.updateStatus(`Loading${counter}: ${title}`);
            try {
                audios.push(this.createAudio(await this.importFile(file, signal, counter), file));
            }
            catch (error) {
                if (signal.aborted) return;
                if (!error.user) Log.error(`Load file ${title} (user ${this.id})`, error);
                failed.push(error.user ? `${title}: ${error.message}` : title);
            }
        }

        if (!audios.length) return this.fail(previous, `Failed to load: ${failed.join(", ")}`);
        if (failed.length) this.notify(`Failed to load: ${failed.join(", ")}`);
        this.removeSearch();
        if (audios.length == 1) {
            this.mode = "telegram";
            this.audio = audios[0];
        }
        else {
            this.mode = "playlist";
            this.playlist = audios;
            this.playlistId = 0;
            this.batched = true;
        }
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

    /**
     * @param {AbortSignal} [signal] of the action that sends several audios
     */
    async send(signal) {
        if (this.status != "default") return;
        signal ??= this.startAction(() => this.restoreMenu());

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
            if (audio.cuts.length) await Files.cut(Files.path(source.path, source.file), audioPath, Utility.getKept(audio.cuts, source.duration), signal);
            else Files.copy(Files.path(source.path, source.file), audioPath);

            var poster = audio.poster && await this.getPosterFile();
            await Network.uploadFile(this.id, audioPath, {title: title, performer: audio.performer, duration: duration, thumbnail: poster && {source: poster}}, this.progress(`Uploading: ${title}`, signal), signal);
            History.update(audio);
        }
        catch (error) {
            if (!signal.aborted) {
                Log.error(`Send ${title} (user ${this.id})`, error);
                App.app.telegram.sendMessage(this.id, `Failed to send: ${title}`).catch(() => {});
            }
        }
        Files.delete(audioPath);
        if (signal.aborted) return;

        this.status = "default";
        this.clearStatus();
        await this.sendMenu();

    }

    /**
     * @param {AbortSignal} signal
     */
    async sendSource(signal) {
        var audio = this.getAudio();
        var source = audio.source;

        if (source.id) {
            try {
                audio.sourceMessage = (await App.app.telegram.sendAudio(this.id, source.id)).message_id;
                return;
            }
            catch (error) {
                Log.error(`Send source (user ${this.id})`, error);
            }
        }
        this.updateStatus(`Uploading: ${source.title}`);
        var poster = Files.path(source.path, "poster.jpg");
        var thumbnail = Files.exists(poster) ? {source: await this.getFormatted(poster).catch(() => poster)} : undefined;
        var msg = await Network.uploadFile(this.id, Files.path(source.path, source.file), {title: source.title, performer: source.performer, duration: source.duration, thumbnail: thumbnail}, this.progress(`Uploading: ${source.title}`, signal), signal);
        audio.sourceMessage = msg.message_id;
        source.id = msg.audio.file_id;
        source.limited = source.file != "audio.m4a";
        Files.saveAudio(source.path, source);
        this.clearStatus();
    }

    async parsePlaylist() {
        var signal = this.startAction(() => this.decline());
        this.batched = true;
        this.playlistId = 0;
        while (this.playlistId < this.playlist.length) {
            this.setPoster("default");
            if (await this.parseLink(signal)) this.playlistId++;
            else if (signal.aborted) return;
            else this.playlist.splice(this.playlistId, 1);
        }
        this.status = this.playlist.length ? "default" : "none";
        this.playlistId = 0;
        if (this.playlist.length == 1) {
            this.mode = "youtube";
            this.audio = this.playlist[0];
        }
        await this.sendMenu("new");
    }

    async sendPlaylist() {
        if (this.mode != "playlist" || this.status != "default") return;
        var last = this.playlistId;
        var signal = this.startAction(() => {
            this.playlistId = last;
            this.restoreMenu();
        });
        this.playlistId = 0;
        for (var _ of this.playlist) {
            await this.send(signal);
            if (signal.aborted) return;
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
            if (!audio.source.silences) this.updateStatus("Looking for silence");
            await Promise.all([this.loadSegments(audio.source), this.loadSilences(audio.source)]);
            this.clearStatus();
            if (this.status == "loading" || this.status == "none") return;
        }
        var menuText = this.getMenuText(mode).replaceAll(".", "\\.").replaceAll("-", "\\-");
        var previous = this.status;
        this.status = mode;

        if (mode == "new") {
            this.removeMenu();
            this.status = "default";
            var msg = await App.app.telegram.sendMessage(this.id, menuText, this.getMainMenu());
            this.menu = msg.message_id;
            this.scanSilences();
        }
        else if (mode == "default") await this.editMenu(menuText, this.getMainMenu());
        else if (mode == "title") this.editMenu(menuText, Menus.Cancel);
        else if (mode == "titles") this.editMenu(menuText, Menus.Titles);
        else if (mode == "order") this.editMenu(menuText, Menus.Order);
        else if (mode == "performer") this.editMenu(menuText, audio.performer ? (audio.performer == audio.source.performer ? Menus.RemoveOnly : Menus.DefaultNRemove) : Menus.DefaultOnly);
        else if (mode == "poster") {
            if (audio.poster) {
                this.removeMenu();
                var poster = audio.posterId ?? {source: audio.posterFile};
                if (audio.poster == "default") poster = audio.source.posterId ?? {source: Files.path(audio.source.path, "poster.jpg")};
                if (audio.posterFormatted) poster = {source: await this.getPosterFile()};
                var markup = Menus.GeneratePoster(audio.poster, audio.posterFormatted, audio.source.uploaded);
                var msg = await App.app.telegram.sendPhoto(this.id, poster, {...markup, caption: menuText});
                this.menu = msg.message_id;
                if (audio.poster == "default" && !audio.source.posterId && !audio.posterFormatted) {
                    audio.source.posterId = msg.photo.toReversed()[0].file_id;
                    Files.saveAudio(audio.source.path, audio.source);
                }
            }
            else {
                try {
                    await App.app.telegram.editMessageText(this.id, this.menu, null, menuText, Menus.GeneratePoster(null, false, audio.source.uploaded));
                }
                catch (error) {
                    if (!error.response?.description?.includes("no text in the message to edit")) Log.error(`Menu ${mode} (user ${this.id})`, error);
                    this.removeMenu();
                    var msg = await App.app.telegram.sendMessage(this.id, menuText, Menus.GeneratePoster(null, false, audio.source.uploaded));
                    this.menu = msg.message_id;
                }
            }
        }
        else if (mode == "cuts") {
            var cuts = Menus.GenerateCuts(this.getSuggestions().length, audio.cuts.length);
            if (previous == "cuts") this.editMenu(menuText, cuts);
            else {
                this.removeMenu();
                var msg = await App.app.telegram.sendMessage(this.id, menuText, {...cuts, ...(audio.sourceMessage && {reply_parameters: {message_id: audio.sourceMessage, allow_sending_without_reply: true}})});
                this.menu = msg.message_id;
            }
        }
    }

    /**
     * @param {AudioSource} source
     * @returns {Promise<boolean>}
     */
    async loadSegments(source) {
        if (source.segments) return true;
        var id = source.url && Utility.getIdFromUrl(source.url);
        try {
            await Utility.lock(`${source.path}#segments`, async () => {
                source.segments ??= id ? await Network.fetchSegments(id, source.duration) : [];
            });
            return true;
        }
        catch (error) {
            Log.error(`SponsorBlock ${source.url} (user ${this.id})`, error);
            return false;
        }
    }

    /**
     * @param {AudioSource} source
     * @returns {Promise<boolean>}
     */
    async loadSilences(source) {
        if (source.silences) return true;
        try {
            await Utility.lock(`${source.path}#silences`, async () => {
                if (source.silences) return;
                var saved = Files.exists(source.path, "data.json") ? Files.loadAudio(source.path) : null;
                source.silences = saved?.silences ?? await Utility.queue("silence", 1, () => Files.detectSilence(Files.path(source.path, source.file)));
                if (saved && !saved.silences) {
                    saved.silences = source.silences;
                    Files.saveAudio(source.path, saved);
                }
            });
            return true;
        }
        catch (error) {
            source.silences ??= [];
            Log.error(`Silence ${source.path} (user ${this.id})`, error);
            return false;
        }
    }

    /**
     * @param {Audio} [audio]
     */
    getSuggestions(audio = this.getAudio()) {
        var silences = (audio.source.silences ?? []).toSorted((first, second) => second.end - second.start - (first.end - first.start));
        return [...(audio.source.segments ?? []), ...silences].filter(segment => !audio.cuts.some(([start, end]) => start <= segment.start && end >= segment.end)).slice(0, User.maxSuggestions).sort((first, second) => first.start - second.start);
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
        return this.mode == "playlist" ? Menus.GenerateBatch(this.batched) : Menus.Main;
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

    getShared() {
        return this.mode == "playlist" && this.batched ? this.playlist : [this.getAudio()];
    }

    /**
     * @param {string | null} performer
     */
    setPerformer(performer) {
        for (var audio of this.getShared()) audio.performer = performer;
    }

    resetPerformer() {
        for (var audio of this.getShared()) audio.performer = audio.source.performer;
    }

    /**
     * @param {"default" | null} mode
     */
    applyPoster(mode) {
        for (var audio of this.getShared()) this.setPoster(mode == "default" && !Files.exists(audio.source.path, "poster.jpg") ? null : mode, audio);
    }

    /**
     * @param {"default" | null} mode
     * @param {Audio} [audio]
     */
    setPoster(mode, audio = this.getAudio()) {
        if (!mode) audio.poster = null;
        else {
            audio.poster = "default";
            audio.posterFormatted = true;
        }
    }

    /**
     * @param {string} fileId
     */
    async setCustomPoster(fileId) {
        var fileLink = await App.app.telegram.getFileLink(fileId).catch(() => null);
        var path = this.getPosterPath();
        if (!fileLink || !await Network.downloadImage(fileLink, path).catch(() => false)) return this.updateStatus("Failed to download poster");
        this.clearStatus();
        Files.delete(path.replace(/\.jpg$/, "-formatted.jpg"));
        try {
            await this.getFormatted(path);
        }
        catch (error) {
            Log.error(`Format poster (user ${this.id})`, error);
            return this.updateStatus("Failed to format the poster");
        }
        this.applyCustomPoster(path, fileId);
        this.sendMenu("poster");
    }

    /**
     * @param {string} url of a YouTube video, its thumbnail becomes the formatted poster
     */
    async setLinkPoster(url) {
        var id = Utility.getIdFromUrl(url);
        var path = this.getPosterPath();
        var loaded = false;
        for (var name of ["maxresdefault", "sddefault", "hqdefault"]) {
            loaded = await Network.downloadImage(`https://i.ytimg.com/vi/${id}/${name}.jpg`, path, Network.posterFileLimit).catch(() => false);
            if (loaded) break;
        }
        if (!loaded) return this.updateStatus("Failed to download poster");
        Files.delete(path.replace(/\.jpg$/, "-formatted.jpg"));
        try {
            await this.getFormatted(path);
        }
        catch (error) {
            Log.error(`Format poster (user ${this.id})`, error);
            return this.updateStatus("Failed to format the poster");
        }
        this.clearStatus();
        this.applyCustomPoster(path, null);
        this.sendMenu("poster");
    }

    /**
     * @param {string} path
     * @param {string | null} fileId
     */
    applyCustomPoster(path, fileId) {
        for (var audio of this.getShared()) {
            audio.poster = "custom";
            audio.posterId = fileId;
            audio.posterFile = path;
            audio.posterFormatted = true;
        }
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

    getSharedCookies() {
        if (this.isAdmin() || Files.getSetting("shareCookies") == "off") return null;
        var shared = Files.path("downloads", "users", String(Files.config.admin), "cookies.txt");
        return Files.exists(shared) ? shared : null;
    }

    /**
     * @param {string} reason
     * @param {AbortSignal} signal
     * @returns {Promise<string | null>} cookies file to retry with
     */
    async askCookies(reason, signal) {
        if (this.hasCookies()) return this.getCookiesPath();
        var shared = this.getSharedCookies();
        if (!shared) return null;
        if (Files.getSetting("shareCookies") == "confirm") {
            this.updateStatus(`Waiting for the admin to allow cookies: ${reason}`);
            if (!await Panel.askCookies(this, reason, signal)) return null;
        }
        return shared;
    }

    /**
     * @param {(cookies?: string) => Promise<any>} task runs without cookies first
     * @param {string} reason
     * @param {AbortSignal} signal
     */
    async withCookies(task, reason, signal) {
        try {
            return await task();
        }
        catch (error) {
            if (!Network.needsCookies(error)) throw error;
            var cookies = await this.askCookies(reason, signal);
            if (!cookies) throw error;
            return await task(cookies);
        }
    }

    hasCookies() {
        return Files.exists(this.getCookiesPath());
    }

    /**
     * @param {{file_id: string, file_size?: number}} document
     */
    async setCookies(document) {
        if (document.file_size > Network.cookiesFileLimit) return this.notify("Cookies file is too big");
        var path = this.getCookiesPath();
        var temp = `${path}.tmp`;
        var checking = null;
        var text = "Failed to save cookies";
        try {
            var link = await App.app.telegram.getFileLink(document.file_id);
            var buffer = await Network.downloadFile(link, Network.cookiesFileLimit);
            if (!buffer) return this.notify("Failed to download the cookies file");
            var cookies = Utility.parseCookies(buffer.toString("utf8"));
            if (!cookies) return this.notify("No YouTube cookies found in the file, send a .txt file in Netscape format");
            if (!Utility.hasLogin(cookies)) return this.notify("The cookies are not signed in to YouTube, sign in and export them again, see /cookies");
            checking = await this.notify("Checking cookies");
            await Utility.lock(temp, async () => {
                try {
                    Files.write(temp, cookies, 0o600);
                    var result = await Utility.timeout(Network.checkCookies(temp), Network.infoTimeout, "Checking cookies timed out").catch(error => {
                        Log.error(`Check cookies (user ${this.id})`, error);
                        throw User.expected("Failed to check the cookies, try again later");
                    })
                    if (result == "valid") Files.move(temp, path);
                    text = {valid: "Cookies saved", rotated: "YouTube signed these cookies out, they were rotated. Export them again as described in /cookies", rejected: "YouTube rejected these cookies. Send new cookies, see /cookies"}[result];
                }
                finally {
                    Files.tryDelete(temp);
                }
            })
        }
        catch (error) {
            if (!error.user) Log.error(`Save cookies (user ${this.id})`, error);
            text = error.user ? error.message : "Failed to save cookies";
        }
        if (checking) App.app.telegram.editMessageText(this.id, checking.message_id, null, text).catch(() => this.notify(text));
        else this.notify(text);
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
        var signal = this.startAction(() => this.decline());
        this.removeConfirm();
        this.updateStatus(`Fetching playlist: ${lists[0]}`);

        try {
            var ids = new Set(urls.map(url => Utility.getIdFromUrl(url)));
            var title = null;
            for (var list of lists) {
                var playlist = await Utility.abortable(Utility.timeout(this.fetchList(list, signal), Network.playlistTimeout, "Fetching playlist timed out"), signal);
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
            if (signal.aborted) return;
            Log.error(`Playlist ${lists[0]} (user ${this.id})`, error);
            this.decline(Network.needsCookies(error) ? this.getBlockedText(error) : `Failed to load: ${lists[0]}`);
        }
    }

    /**
     * @param {string} url
     * @param {AbortSignal} signal
     */
    async fetchList(url, signal) {
        return await this.withCookies(cookies => Network.fetchPlaylist(url, cookies), url, signal);
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

    /**
     * @param {any} error
     */
    getBlockedText(error) {
        var problem = Network.cookieProblem(error);
        if (!this.hasCookies()) return problem == "format" ? "YouTube provided no audio for this video. Sending your YouTube cookies may help, see /cookies" : "YouTube blocked this request. Send your YouTube cookies and try again, see /cookies";
        if (problem == "format") return "YouTube provided no audio for this video even with your cookies";
        if (problem == "age") return "YouTube does not allow this video for the account of your cookies";
        return "YouTube rejected your cookies. Send new cookies, see /cookies";
    }

    async getPosterFile() {
        var audio = this.getAudio();
        var path = audio.poster == "default" ? Files.path(audio.source.path, "poster.jpg") : audio.posterFile;
        return audio.posterFormatted ? await this.getFormatted(path) : path;
    }

    /**
     * @param {string} poster
     * @returns {Promise<string>} the formatted version, made when missing
     */
    async getFormatted(poster) {
        var formatted = poster.replace(/\.jpg$/, "-formatted.jpg");
        if (!Files.exists(formatted)) await Files.formatPoster(poster, formatted);
        return formatted;
    }

    async toggleFormat() {
        var audio = this.getAudio();
        if (this.status != "poster" || !audio.poster) return;
        var value = !audio.posterFormatted;
        var changed = this.getShared().filter(item => item.poster);
        var previous = changed.map(item => item.posterFormatted);
        changed.forEach(item => item.posterFormatted = value);
        try {
            if (value) await this.getPosterFile();
        }
        catch (error) {
            Log.error(`Format poster (user ${this.id})`, error);
            changed.forEach((item, index) => item.posterFormatted = previous[index]);
            return this.updateStatus("Failed to format the poster");
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
        return Files.path(this.getUserPath(), this.mode != "playlist" ? "poster.jpg" : this.batched ? "poster-batch.jpg" : `poster${Date.now()}.jpg`);
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
        info.text += info.poster ? `Poster: ${{"default": audio.source.uploaded ? "Original" : "Youtube", "custom": "Custom"}[info.poster]}${audio.posterFormatted ? ", formatted" : ""}` : "No poster";
        if (info.cuts.length) info.text += `\nCuts: ${info.cuts.length}, new duration \`${Utility.getDurationString(Utility.getDuration(info.duration, info.cuts))}\``;
        if (this.getSuggestions().length) info.text += "\n*Suggested segments found\\! See __Cuts__*";

        return info;

    }

    /**
     * @param {"new" | "default" | "title" | "performer" | "poster" | "cuts"} mode
     */
    getMenuText(mode) {
        var info = this.getInfo();
        if (mode == "new" || mode == "default") return info.text;
        if (mode == "title") return `Current title: \`${info.title}\`\nSend new title`;
        if (mode == "titles") return `\`${this.playlistId + 1}/${this.playlist.length}\`\nCurrent title: \`${info.title}\`\nSend new title, or skip it`;
        if (mode == "order") {
            var count = this.playlist.length;
            var from = Math.max(0, Math.min(this.playlistId - 7, count - 15));
            var lines = ["Select an audio and move it, or send a move like `5 2` to put audio 5 on position 2, one move per line"];
            if (from > 0) lines.push("...");
            for (var index = from; index < Math.min(count, from + 15); index++) {
                var audio = this.playlist[index];
                var title = Utility.escapeCode((audio.title ?? audio.source.title ?? "").replace(/\s+/g, " ").slice(0, 40) || "untitled");
                lines.push(`${index == this.playlistId ? `*${index + 1}.*` : `${index + 1}.`} \`${title}\``);
            }
            if (from + 15 < count) lines.push("...");
            return lines.join("\n");
        }
        if (mode == "performer") return info.performer ? `Current performer: \`${info.performer}\`\nSend new performer` : `Currently no performer\nSend new performer`;
        if (mode == "poster") return info.poster ? `Current poster\nSend new poster` : `Currently no poster\nSend new poster`;
        if (mode == "cuts") {
            var format = ([start, end]) => `${Utility.getDurationString(start)} - ${Utility.getDurationString(end)}`;
            var suggestions = this.getSuggestions();
            var lines = [info.cuts.length ? "Cuts:" : "No cuts"];
            info.cuts.forEach((cut, index) => lines.push(`${index + 1}. ${format(cut)}`));
            if (suggestions.length) lines.push("Suggested cuts:");
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

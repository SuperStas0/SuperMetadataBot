export class Audio {
    /**
     * @param {string} [url]
     */
    constructor (url) {
        /** @type {AudioSource} */
        this.source = new AudioSource(url);

        /** @type {string | null} */
        this.title = null;

        /** @type {string | null} */
        this.performer = null;

        /** @type {Cut[]} */
        this.cuts = [];

        /** @type {PosterMode} */
        this.poster = null;

        /** @type {string | null} */
        this.posterId = null;

        /** @type {string | null} file of the custom poster */
        this.posterFile = null;

        /** @type {boolean} */
        this.posterFormatted = false;

        /** @type {number | null} */
        this.logId = null;

        /** @type {number | null} message of the loaded audio in the chat */
        this.sourceMessage = null;
    }
}

export class AudioSource {
    /**
     * @param {string} [url]
     */
    constructor (url) {
        /** @type {string} */
        this.url = url ?? null;

        /** @type {string} */
        this.path = null;

        /** @type {string | null} */
        this.id = null;

        /** @type {string | null} */
        this.posterId = null;

        /** @type {string} */
        this.title = null;

        /** @type {string} */
        this.performer = null;

        /** @type {number} */
        this.duration = null;

        /** @type {boolean} */
        this.limited = false;

        /** @type {string} */
        this.file = "audio.m4a";

        /** @type {Segment[] | null} */
        this.segments = null;

        /** @type {Segment[] | null} */
        this.silences = null;

        /** @type {boolean} */
        this.uploaded = false;
    }
}

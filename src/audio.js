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

        /** @type {number | null} */
        this.start = null;

        /** @type {number | null} */
        this.end = null;

        /** @type {PosterMode} */
        this.poster = null;

        /** @type {string | null} */
        this.posterId = null;

        /** @type {boolean} */
        this.posterSquare = false;
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
    }
}

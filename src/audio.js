export class Audio {
    constructor () {
        /** @type {AudioSource} */
        this.source = null;
    }
}

export class AudioSource {
    constructor () {
        /** @type {string} */
        this.path = null;

        /** @type {number | null} */
        this.id = null;

        /** @type {string} */
        this.title = null;

        /** @type {string} */
        this.performer = null;

        /** @type {number} */
        this.duration = null;
    }
}

export class AudioSettings {
    constructor () {
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
    }
}

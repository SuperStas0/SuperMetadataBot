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
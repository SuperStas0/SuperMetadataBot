/** @typedef {"none" | "loading" | "default" | "title" | "performer" | "poster" | "start" | "end"} UserStatus */

/** @typedef {"none" | "youtube" | "telegram" | "playlist"} UserMode */

/** @typedef {"default" | "custom" | null} PosterMode */

/** @typedef {Record<string, number | string>} ConfigFile */

/** @typedef {NonNullable<Parameters<import("telegraf").Telegram["sendAudio"]>[2]>} ExtraAudio */

/** @typedef {import("telegraf").Context} Context */

// /** @typedef {import("telegraf").Markup} Markup*/

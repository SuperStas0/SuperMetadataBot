/** @typedef {"none" | "loading" | "default" | "title" | "performer" | "poster" | "cuts" | "titles" | "order"} UserStatus */

/** @typedef {"none" | "youtube" | "telegram" | "playlist"} UserMode */

/** @typedef {"default" | "custom" | null} PosterMode */

/** @typedef {[number, number]} Cut */

/** @typedef {{start: number, end: number, category: string}} Segment */

/** @typedef {{id: string, title: string, channel: string, views: number | null, duration: number | null}} SearchResult */

/** @typedef {{id: string, uniqueId: string, size?: number, name?: string, title?: string, performer?: string, document?: boolean, messageId?: number}} TelegramFile */

/** @typedef {{id: number, time: number, userId: number, user: string, title: string, performer: string | null, upload: boolean, fileId: string, document: boolean, changes: string[] | null}} HistoryEntry */

/** @typedef {Record<string, number | string>} ConfigFile */

/** @typedef {NonNullable<Parameters<import("telegraf").Telegram["sendAudio"]>[2]>} ExtraAudio */

/** @typedef {import("telegraf").Context} Context */

// /** @typedef {import("telegraf").Markup} Markup*/

import { createRequire } from "module";
const require = createRequire(import.meta.url);

const { TelegramClient } = require("telegram");
const { StringSession } = require("telegram/sessions");
const { CustomFile } = require("telegram/client/uploads");
import fs from "fs";
import path from "path";
const config = require("./config.json");

const filePath = "downloads\\ytd\\MHI_-KWkb5M\\audio.m4a";
const CHAT_ID = "me"; // sends to your own Saved Messages for testing

(async () => {
    if (!fs.existsSync(filePath)) {
        console.error("File not found:", filePath);
        process.exit(1);
    }

    const fileSize = fs.statSync(filePath).size;
    console.log(`File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);

    const client = new TelegramClient(
        new StringSession(config.sessionId),
        config.apiId,
        config.apiHash,
        { connectionRetries: 5 }
    );

    console.log("Connecting...");
    await client.connect();

    const me = await client.getMe();
    console.log("Logged in as:", me.username || me.id);

    try {
        console.log("Uploading file...");
        const uploadedFile = await client.uploadFile({
            file: new CustomFile(path.basename(filePath), fileSize, filePath),
            workers: 4,
            onProgress: (progress) => {
                process.stdout.write(`\rUpload progress: ${(progress * 100).toFixed(1)}%`);
            }
        });
        console.log("\nUpload finished. Sending message...");

        const result = await client.sendFile(CHAT_ID, {
            file: uploadedFile,
            attributes: [], // add DocumentAttributeAudio here later if needed
            caption: "test upload via userbot"
        });

        console.log("Sent successfully. Message ID:", result.id);
    } catch (err) {
        console.error("ERROR during upload/send:");
        console.error(err);
    } finally {
        await client.disconnect();
    }
})();
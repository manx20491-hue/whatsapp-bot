const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const ytdl = require('@distube/ytdl-core');
const fs = require('fs');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let latestQR = null;
let botStarted = false;

// Ensure auth folder exists
if (!fs.existsSync('./auth')) {
    fs.mkdirSync('./auth');
}

app.get('/health', (req, res) => {
    res.send('OK');
});

app.get('/', (req, res) => {
    res.send(`
        <html>
        <head><title>WhatsApp Bot QR</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif">
            <h2>WhatsApp Bot QR Code</h2>
            ${latestQR ? `<img src="${latestQR}" width="300" />` : '<p>Waiting for QR...</p>'}
            <p>Keep this page open while connecting bot</p>
        </body>
        </html>
    `);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, "0.0.0.0", () => {
    console.log('QR Web Preview running on port ' + PORT);
});

async function startBot() {
    if (botStarted) return;
    botStarted = true;

    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        const qr = update.qr;

        if (qr) {
            try {
                latestQR = await QRCode.toDataURL(qr);
            } catch (e) {}
        }

        if (connection === 'open') {
            latestQR = null;
        }

        if (connection === 'close') {
            botStarted = false;
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
        const from = msg.key.remoteJid;

        if (!text) return;

        const cmd = text.toLowerCase();

        if (cmd === 'hi') {
            await sock.sendMessage(from, { text: 'Hello 👋 I am your WhatsApp Bot' });
        }

        if (cmd === 'menu') {
            await sock.sendMessage(from, { text: '🤖 Bot Menu:\nhi\nmenu\nping\n.song <yt link>' });
        }

        if (cmd === 'ping') {
            await sock.sendMessage(from, { text: 'pong 🏓' });
        }

        // FIXED SONG COMMAND (NO FREEZE VERSION)
        if (command === "song") {
    if (!text) return reply("Send a YouTube link");

    try {
        await reply("🎬 Downloading video... please wait");

        const stream = ytdl(text, {
            filter: "audioandvideo",
            quality: "highest"
        });

        let chunks = [];

        stream.on("data", (chunk) => {
            chunks.push(chunk);
        });

        stream.on("error", (err) => {
            console.log(err);
            reply("❌ Failed to download video");
        });

        stream.on("end", async () => {
            const buffer = Buffer.concat(chunks);

            await sock.sendMessage(from, {
                video: buffer,
                caption: "✅ Here is your video"
            }, { quoted: msg });
        });

        // IMPORTANT TIMEOUT (prevents infinite freeze)
        setTimeout(() => {
            try {
                stream.destroy();
                reply("❌ Download timeout. Try another video.");
            } catch (e) {}
        }, 60000);

    } catch (e) {
        console.log(e);
        reply("❌ Error processing video");
    }
}

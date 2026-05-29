const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');

const app = express();
let latestQR = null;

// HEALTH CHECK (Replit friendly)
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log('QR Web Preview running on port ' + PORT);
});

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Convert QR to web image
        if (qr) {
            try {
                latestQR = await QRCode.toDataURL(qr);
                console.log('QR updated for web preview');
            } catch (e) {
                console.log('QR generation error', e);
            }
        }

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('WhatsApp Bot Connected Successfully');
            latestQR = null;
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

        if (text.startsWith('.song')) {
            const args = text.split(' ');
            const url = args[1];

            if (!url || !ytdl.validateURL(url)) {
                await sock.sendMessage(from, { text: '❌ Send valid YouTube link' });
                return;
            }

            const fileName = path.join(__dirname, `song_${Date.now()}.mp4`);

            try {
                await sock.sendMessage(from, { text: '🎬 Downloading video... please wait' });

                const videoStream = ytdl(url, {
                    filter: 'audioandvideo',
                    quality: 'highest'
                });

                const writeStream = fs.createWriteStream(fileName);
                videoStream.pipe(writeStream);

                writeStream.on('finish', async () => {
                    const buffer = fs.readFileSync(fileName);

                    await sock.sendMessage(from, {
                        video: buffer,
                        caption: '🎬 Here is your video'
                    });

                    fs.unlinkSync(fileName);
                });

                writeStream.on('error', async () => {
                    await sock.sendMessage(from, { text: '❌ Download failed' });
                });

            } catch (e) {
                console.log(e);
                await sock.sendMessage(from, { text: '❌ Failed to process video' });
            }
        }
    });
}

startBot();
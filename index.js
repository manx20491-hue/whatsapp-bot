const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const ytdl = require('ytdl-core');
const fs = require('fs');
const path = require('path');

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Connection closed. Reconnecting:', shouldReconnect);
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('WhatsApp Bot Connected Successfully');
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

        // FIXED .song command
        if (text.startsWith('.song')) {
            const args = text.split(' ');
            const url = args[1];

            if (!url || !ytdl.validateURL(url)) {
                await sock.sendMessage(from, { text: '❌ Send valid YouTube link\nExample: .song https://youtu.be/xxxx' });
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

                    fs.unlinkSync(fileName); // delete temp file
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
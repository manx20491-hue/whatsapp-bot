const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const fs = require('fs');

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

        console.log('Message:', text);

        if (!text) return;

        const cmd = text.toLowerCase();

        if (cmd === 'hi') {
            await sock.sendMessage(from, { text: 'Hello 👋 I am your WhatsApp Bot' });
        }

        if (cmd === 'menu') {
            await sock.sendMessage(from, { text: '🤖 Bot Menu:\n• hi - greet bot\n• menu - show menu' });
        }

        if (cmd === 'ping') {
            await sock.sendMessage(from, { text: 'pong 🏓' });
        }
    });
}

startBot();
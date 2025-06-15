const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

const config = require('./config');
const logger = require('./utils/logger');
const messageHandler = require('./handlers/messageHandler');
const commandManager = require('./utils/commands');
const pluginManager = require('./utils/pluginManager');

class WhatsAppBot {
    constructor() {
        this.sock = null;
        this.qrRetries = 0;
        this.maxQrRetries = 3;
    }

    async initialize() {
        try {
            logger.info(`🤖 Starting ${config.BOT_NAME}...`);
            logger.info(`🔒 Mode: ${config.PRIVATE_MODE ? 'Private' : 'Public'}`);
            logger.info(`💡 Prefix: ${config.PREFIX}`);

            // Load plugins
            await pluginManager.loadPlugins();

            // Start WhatsApp connection
            await this.connectToWhatsApp();

        } catch (error) {
            logger.error('Failed to initialize bot:', error);
            process.exit(1);
        }
    }

    async connectToWhatsApp() {
        const sessionDir = config.SESSION_FOLDER;
        
        // Ensure session directory exists
        if (!fs.existsSync(sessionDir)) {
            fs.mkdirSync(sessionDir, { recursive: true });
        }

        // Get auth state
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        // Get latest Baileys version
        const { version, isLatest } = await fetchLatestBaileysVersion();
        logger.info(`Using WA v${version.join('.')}, isLatest: ${isLatest}`);

        // Create socket
        this.sock = makeWASocket({
            version,
            printQRInTerminal: false,
            auth: state,
            browser: ['Bot', 'Desktop', '1.0.0'],
            defaultQueryTimeoutMs: 60000,
        });

        // Store removed - using lighter setup

        // Event handlers
        this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
        this.sock.ev.on('creds.update', saveCreds);
        this.sock.ev.on('messages.upsert', this.handleMessages.bind(this));

        // Auto-read and typing indicators
        if (config.AUTO_READ) {
            this.sock.ev.on('messages.upsert', async (m) => {
                const messages = m.messages;
                for (const message of messages) {
                    if (!message.key.fromMe) {
                        await this.sock.readMessages([message.key]);
                    }
                }
            });
        }

        return this.sock;
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            // Generate pairing code instead of QR
            await this.generatePairingCode();
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            
            logger.info('Connection closed due to:', lastDisconnect?.error);
            
            if (shouldReconnect) {
                logger.info('Reconnecting...');
                setTimeout(() => this.connectToWhatsApp(), 3000);
            } else {
                logger.info('Bot logged out. Please restart to reconnect.');
            }
        } else if (connection === 'open') {
            logger.info('✅ WhatsApp connection established successfully!');
            logger.info(`📱 Bot Number: ${this.sock.user?.id}`);
            
            // Send startup message to owner
            if (config.OWNER_NUMBER) {
                try {
                    await this.sock.sendMessage(`${config.OWNER_NUMBER}@s.whatsapp.net`, {
                        text: `🤖 *${config.BOT_NAME} Started!*\n\n✅ Connection: Established\n🔒 Mode: ${config.PRIVATE_MODE ? 'Private' : 'Public'}\n💡 Prefix: ${config.PREFIX}\n⏰ Time: ${new Date().toLocaleString()}\n\nBot is ready to receive commands!`
                    });
                } catch (error) {
                    logger.error('Failed to send startup message to owner:', error);
                }
            }
        }
    }

    async generatePairingCode() {
        try {
            if (!config.PHONE_NUMBER) {
                logger.error('PHONE_NUMBER not set in config');
                return;
            }

            if (this.qrRetries >= this.maxQrRetries) {
                logger.error('Max pairing code retries reached');
                return;
            }

            this.qrRetries++;
            
            // Clean phone number (remove + and spaces)
            const phoneNumber = config.PHONE_NUMBER.replace(/[^0-9]/g, '');
            
            const code = await this.sock.requestPairingCode(phoneNumber);
            logger.info(`📱 Pairing Code: ${code}`);
            logger.info(`📋 Instructions:`);
            logger.info(`1. Open WhatsApp on your phone`);
            logger.info(`2. Go to Settings > Linked Devices`);
            logger.info(`3. Tap "Link a Device"`);
            logger.info(`4. Choose "Link with phone number instead"`);
            logger.info(`5. Enter this code: ${code}`);
            
        } catch (error) {
            logger.error('Failed to generate pairing code:', error);
        }
    }

    async handleMessages(m) {
        try {
            const messages = m.messages;
            
            for (const message of messages) {
                // Skip if message is from bot itself
                if (message.key.fromMe) continue;
                
                // Process message
                await messageHandler.processMessage(this.sock, message);
                
                // Auto typing indicator
                if (config.AUTO_TYPING) {
                    await this.sock.sendPresenceUpdate('composing', message.key.remoteJid);
                    setTimeout(async () => {
                        await this.sock.sendPresenceUpdate('paused', message.key.remoteJid);
                    }, 1000);
                }
            }
        } catch (error) {
            logger.error('Error handling messages:', error);
        }
    }
}

// Start the bot
const bot = new WhatsAppBot();

// Handle process termination
process.on('SIGINT', () => {
    logger.info('Received SIGINT, shutting down gracefully');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, shutting down gracefully');
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Start the bot
bot.initialize().catch((error) => {
    logger.error('Failed to start bot:', error);
    process.exit(1);
});

// Export for potential testing
module.exports = WhatsAppBot;

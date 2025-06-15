const { 
    default: makeWASocket, 
    DisconnectReason, 
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    isJidBroadcast
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
        this.maxQrRetries = 5; // Increased retry limit
        this.connectionAttempts = 0;
        this.maxConnectionAttempts = 10;
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
        try {
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

            // Create socket with optimized configuration for Replit
            this.sock = makeWASocket({
                version,
                printQRInTerminal: false,
                auth: state,
                browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
                logger: logger.child({ class: 'baileys' }),
                markOnlineOnConnect: true,
                syncFullHistory: false,
                fireInitQueries: true,
                generateHighQualityLinkPreview: true,
                defaultQueryTimeoutMs: 60000,
                connectTimeoutMs: 60000,
                keepAliveIntervalMs: 30000,
                retryRequestDelayMs: 1000,
                maxMsgRetryCount: 5,
                shouldIgnoreJid: jid => isJidBroadcast(jid),
                shouldSyncHistoryMessage: msg => {
                    return !!msg.message && !!msg.message.conversation;
                },
                emitOwnEvents: false,
                msgRetryCounterCache: null,
                // Add mobile API configuration
                mobile: false,
                patchMessageBeforeSending: (message) => {
                    const requiresPatch = !!(
                        message.buttonsMessage ||
                        message.templateMessage ||
                        message.listMessage
                    );
                    if (requiresPatch) {
                        message = {
                            viewOnceMessage: {
                                message: {
                                    messageContextInfo: {
                                        deviceListMetadataVersion: 2,
                                        deviceListMetadata: {},
                                    },
                                    ...message,
                                },
                            },
                        };
                    }
                    return message;
                }
            });

            // Event handlers
            this.sock.ev.on('connection.update', this.handleConnectionUpdate.bind(this));
            this.sock.ev.on('creds.update', saveCreds);
            this.sock.ev.on('messages.upsert', this.handleMessages.bind(this));

            // Auto-read messages
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
        } catch (error) {
            logger.error('Error creating WhatsApp connection:', error);
            throw error;
        }
    }

    async handleConnectionUpdate(update) {
        const { connection, lastDisconnect, qr, isNewLogin } = update;

        if (qr) {
            // Add delay before generating pairing code to ensure socket is stable
            setTimeout(async () => {
                await this.generatePairingCode();
            }, 2000);
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const errorMessage = lastDisconnect?.error?.message || 'Unknown reason';
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            
            logger.info('Connection closed due to:', errorMessage);
            
            if (shouldReconnect) {
                // Check if this is a connection failure that requires re-authentication
                const isConnectionFailure = errorMessage.includes('Connection Failure');
                const isQRFailure = errorMessage.includes('QR refs attempts ended');
                const isAuthFailure = errorMessage.includes('401') || errorMessage.includes('403');
                
                if (isConnectionFailure || isQRFailure || isAuthFailure) {
                    logger.warn('Authentication/Connection failure detected - clearing session and generating new pairing code');
                    
                    // Clear session data for fresh authentication
                    await this.clearSessionData();
                    this.qrRetries = 0;
                    
                    // Wait a bit then reconnect with fresh session
                    setTimeout(() => {
                        logger.info('Reconnecting with fresh session...');
                        this.connectToWhatsApp();
                    }, 3000);
                } else {
                    // Regular connection issue - retry with existing session
                    const delay = Math.min(5000 + (this.connectionAttempts * 2000), 30000);
                    this.connectionAttempts++;
                    
                    if (this.connectionAttempts >= this.maxConnectionAttempts) {
                        logger.error('Max connection attempts reached. Clearing session...');
                        await this.clearSessionData();
                        this.connectionAttempts = 0;
                        this.qrRetries = 0;
                    }
                    
                    logger.info(`Reconnecting in ${delay/1000} seconds... (Attempt ${this.connectionAttempts}/${this.maxConnectionAttempts})`);
                    setTimeout(() => this.connectToWhatsApp(), delay);
                }
            } else {
                logger.info('Bot logged out. Please restart to reconnect.');
            }
        } else if (connection === 'connecting') {
            logger.info('Connecting to WhatsApp...');
        } else if (connection === 'open') {
            logger.info('✅ WhatsApp connection established successfully!');
            logger.info(`📱 Bot Number: ${this.sock.user?.id}`);
            
            // Reset retry counters on successful connection
            this.qrRetries = 0;
            this.connectionAttempts = 0;
            
            // Send startup message to owner
            if (config.OWNER_NUMBER && isNewLogin) {
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
                logger.error('Max pairing code retries reached. Clearing session and restarting...');
                await this.clearSessionData();
                setTimeout(() => {
                    this.qrRetries = 0;
                    this.connectToWhatsApp();
                }, 10000);
                return;
            }

            this.qrRetries++;
            
            // Clean and validate phone number
            let phoneNumber = config.PHONE_NUMBER.replace(/[^0-9]/g, '');
            
            // Ensure proper South African format
            if (phoneNumber.startsWith('0')) {
                phoneNumber = '27' + phoneNumber.substring(1);
            } else if (!phoneNumber.startsWith('27')) {
                phoneNumber = '27' + phoneNumber;
            }
            
            logger.info(`Requesting pairing code for: ${phoneNumber} (Attempt ${this.qrRetries}/${this.maxQrRetries})`);
            
            // Add delay to ensure socket is ready
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const code = await this.sock.requestPairingCode(phoneNumber);
            
            console.log('\n' + '='.repeat(50));
            console.log(`🔗 PAIRING CODE: ${code}`);
            console.log(`📱 For number: ${phoneNumber}`);
            console.log(`🔄 Attempt: ${this.qrRetries}/${this.maxQrRetries}`);
            console.log('='.repeat(50));
            console.log('📋 INSTRUCTIONS:');
            console.log('1. Open WhatsApp on your phone');
            console.log('2. Go to Settings > Linked Devices');
            console.log('3. Tap "Link a Device"');
            console.log('4. Choose "Link with phone number instead"');
            console.log(`5. Enter this code: ${code}`);
            console.log('6. Complete within 60 seconds');
            console.log('='.repeat(50) + '\n');
            
            logger.info(`📱 Pairing Code Generated: ${code}`);
            
        } catch (error) {
            logger.error('Failed to generate pairing code:', error);
            
            // Only retry if we haven't exceeded the limit
            if (this.qrRetries < this.maxQrRetries) {
                const delay = Math.min(5000 * this.qrRetries, 15000); // Exponential backoff
                logger.info(`Retrying pairing code generation in ${delay/1000} seconds...`);
                setTimeout(() => this.generatePairingCode(), delay);
            } else {
                logger.error('Max pairing retries exceeded. Clearing session...');
                await this.clearSessionData();
            }
        }
    }

    async clearSessionData() {
        try {
            const sessionDir = config.SESSION_FOLDER;
            if (fs.existsSync(sessionDir)) {
                const files = fs.readdirSync(sessionDir);
                for (const file of files) {
                    const filePath = path.join(sessionDir, file);
                    if (fs.statSync(filePath).isFile()) {
                        fs.unlinkSync(filePath);
                    }
                }
                logger.info('Session data cleared successfully');
            }
        } catch (error) {
            logger.error('Error clearing session data:', error);
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

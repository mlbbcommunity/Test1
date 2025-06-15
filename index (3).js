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

            // Create socket with optimized configuration for Termux/Mobile environments
            this.sock = makeWASocket({
                version,
                printQRInTerminal: false,
                auth: state,
                browser: ['Termux Bot', 'Mobile', '1.0.0'],
                logger: logger.child({ class: 'baileys' }),
                markOnlineOnConnect: false,
                syncFullHistory: false,
                fireInitQueries: false,
                generateHighQualityLinkPreview: false,
                defaultQueryTimeoutMs: 90000,
                connectTimeoutMs: 90000,
                keepAliveIntervalMs: 25000,
                retryRequestDelayMs: 2000,
                maxMsgRetryCount: 3,
                shouldIgnoreJid: jid => isJidBroadcast(jid),
                shouldSyncHistoryMessage: () => false,
                emitOwnEvents: false,
                msgRetryCounterCache: null,
                // Termux-optimized mobile configuration
                mobile: true,
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
            // Immediately try pairing code generation when QR is triggered
            await this.generatePairingCode();
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
                const isNetworkError = errorMessage.includes('ECONNRESET') || errorMessage.includes('ETIMEDOUT');
                
                if (isConnectionFailure || isQRFailure || isAuthFailure || isNetworkError) {
                    logger.warn(`Network/Auth failure detected: ${errorMessage}`);
                    
                    // For Termux: Wait longer and clear session less aggressively
                    if (this.connectionAttempts < 3) {
                        logger.info('Retrying connection without clearing session...');
                        const delay = 5000 + (this.connectionAttempts * 3000);
                        setTimeout(() => this.connectToWhatsApp(), delay);
                    } else {
                        logger.warn('Multiple failures - clearing session and resetting...');
                        await this.clearSessionData();
                        this.qrRetries = 0;
                        
                        setTimeout(async () => {
                            logger.info('Starting fresh connection...');
                            await this.connectToWhatsApp();
                            setTimeout(async () => {
                                await this.generatePairingCode();
                            }, 3000);
                        }, 2000);
                    }
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
                }, 5000);
                return;
            }

            this.qrRetries++;
            
            // Clean and validate phone number with better formatting
            let phoneNumber = config.PHONE_NUMBER.replace(/[^0-9]/g, '');
            
            // Handle different South African number formats
            if (phoneNumber.length === 10 && phoneNumber.startsWith('0')) {
                // Convert 0683913716 to 27683913716
                phoneNumber = '27' + phoneNumber.substring(1);
            } else if (phoneNumber.length === 9 && !phoneNumber.startsWith('27')) {
                // Convert 683913716 to 27683913716
                phoneNumber = '27' + phoneNumber;
            } else if (phoneNumber.length === 11 && phoneNumber.startsWith('27')) {
                // Keep 27683913716 as is
                phoneNumber = phoneNumber;
            } else {
                // If format is unexpected, try with 27 prefix
                phoneNumber = phoneNumber.replace(/^27/, '');
                phoneNumber = '27' + phoneNumber;
            }
            
            // Validate final format (should be 11 digits starting with 27)
            if (phoneNumber.length !== 11 || !phoneNumber.startsWith('27')) {
                logger.error(`Invalid phone number format: ${phoneNumber}. Should be 11 digits starting with 27.`);
                return;
            }
            
            logger.info(`Requesting pairing code for: ${phoneNumber} (Attempt ${this.qrRetries}/${this.maxQrRetries})`);
            
            // Ensure socket exists and is ready
            if (!this.sock || !this.sock.requestPairingCode) {
                logger.error('Socket not ready for pairing code generation');
                // Try to reconnect
                setTimeout(() => this.connectToWhatsApp(), 2000);
                return;
            }
            
            // Try pairing with the formatted number
            const code = await this.sock.requestPairingCode(phoneNumber);
            
            console.log('\n' + '='.repeat(50));
            console.log(`🔗 PAIRING CODE: ${code}`);
            console.log(`📱 For number: ${phoneNumber}`);
            console.log(`🔄 Attempt: ${this.qrRetries}/${this.maxQrRetries}`);
            console.log('='.repeat(50));
            console.log('📋 TERMUX PAIRING INSTRUCTIONS:');
            console.log('1. ⚠️  CRITICAL: Remove ALL WhatsApp Web devices first!');
            console.log('2. Close ALL WhatsApp Web browser tabs');
            console.log('3. Restart WhatsApp on your phone completely');
            console.log('4. Switch to mobile data (not WiFi)');
            console.log('5. Open WhatsApp → Settings → Linked Devices');
            console.log('6. Tap "Link a Device"');
            console.log('7. Choose "Link with phone number instead"');
            console.log(`8. Enter this EXACT code: ${code}`);
            console.log('9. Complete within 90 seconds');
            console.log('10. 🔄 If failed, wait 2 minutes before retrying');
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

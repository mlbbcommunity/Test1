const config = require('../config');
const commandManager = require('../utils/commands');
const dynamicImporter = require('../utils/dynamicImporter');
const logger = require('../utils/logger');

class MessageHandler {
    constructor() {
        this.processMessage = this.processMessage.bind(this);
    }

    /**
     * Process incoming messages
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     */
    async processMessage(sock, message) {
        try {
            // Skip if no message content
            if (!message.message) return;

            const messageText = this.extractMessageText(message);
            if (!messageText) return;

            const sender = message.key.remoteJid;
            const senderNumber = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');

            // Check for pending command imports
            await this.handlePendingImports(sock, message, messageText, senderNumber);

            // Handle commands
            if (messageText.startsWith(config.PREFIX)) {
                await this.handleCommand(sock, message, messageText);
            }

        } catch (error) {
            logger.error('Error processing message:', error);
        }
    }

    /**
     * Extract text from message
     * @param {Object} message - Message object
     * @returns {string|null} - Message text
     */
    extractMessageText(message) {
        if (message.message.conversation) {
            return message.message.conversation;
        }
        
        if (message.message.extendedTextMessage?.text) {
            return message.message.extendedTextMessage.text;
        }

        return null;
    }

    /**
     * Handle pending command imports
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     * @param {string} messageText - Message text
     * @param {string} senderNumber - Sender number
     */
    async handlePendingImports(sock, message, messageText, senderNumber) {
        // Check if this is a reply and if there's a pending import
        if (!global.pendingImports) return;
        
        const pendingImport = global.pendingImports.get(senderNumber);
        if (!pendingImport) return;

        // Check if this is a reply to the import request or contains code
        const isReply = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const looksLikeCode = messageText.includes('module.exports') || messageText.includes('handler');

        if (isReply || looksLikeCode) {
            // Process the import
            const result = await dynamicImporter.importCommand(
                messageText,
                pendingImport.commandName,
                commandManager
            );

            // Clean up pending import
            global.pendingImports.delete(senderNumber);

            // Send result
            if (result.success) {
                await sock.sendMessage(message.key.remoteJid, {
                    text: `✅ *Import Successful*\n\n🔧 Command: \`${result.commandName}\`\n📦 Status: Ready to use\n\n💡 Use \`.${result.commandName}\` to test it!\n🌐 Use \`.zushi ${result.commandName}\` to make it public`
                });
            } else {
                await sock.sendMessage(message.key.remoteJid, {
                    text: `❌ *Import Failed*\n\n**Error:** ${result.error}\n\n💡 **Tips:**\n• Make sure your command exports an object\n• Include a handler function\n• Check for syntax errors\n• Avoid dangerous functions`
                });
            }
        }
    }

    /**
     * Handle command execution
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     * @param {string} messageText - Message text
     */
    async handleCommand(sock, message, messageText) {
        const commandParts = messageText.slice(config.PREFIX.length).split(' ');
        const commandName = commandParts[0].toLowerCase();
        const args = commandParts.slice(1);

        // Execute command through command manager
        await commandManager.execute(sock, message, commandName, args);
    }
}

module.exports = new MessageHandler();
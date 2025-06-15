/**
 * Admin Tools Plugin for WhatsApp Bot
 * Advanced admin commands for bot management
 */

module.exports = {
    name: 'Admin Tools',
    version: '1.0.0',
    description: 'Advanced admin tools and utilities',
    author: 'Bot Developer',

    async init(commandManager) {
        this.registerCommands(commandManager);
        
        return {
            name: this.name,
            version: this.version,
            description: this.description,
            author: this.author,
            commands: ['broadcast', 'info', 'restart', 'eval']
        };
    },

    registerCommands(commandManager) {
        // Broadcast command (owner only)
        commandManager.register('broadcast', {
            description: 'Send a message to all recent contacts',
            usage: '.broadcast <message>',
            role: 'owner',
            category: 'owner',
            handler: async (sock, message, args) => {
                if (args.length === 0) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '❌ Please provide a message to broadcast.\nExample: .broadcast Hello everyone!'
                    });
                    return;
                }

                const broadcastMessage = args.join(' ');
                const confirmText = `🔊 *Broadcast Preview*\n\n${broadcastMessage}\n\n⚠️ This will be sent to recent contacts. Reply with "CONFIRM" to proceed.`;
                
                await sock.sendMessage(message.key.remoteJid, { text: confirmText });
            }
        });

        // System info command (admin only)
        commandManager.register('info', {
            description: 'Get detailed system information',
            usage: '.info',
            role: 'admin',
            category: 'admin',
            handler: async (sock, message, args) => {
                const os = require('os');
                const uptime = process.uptime();
                const memUsage = process.memoryUsage();
                
                const hours = Math.floor(uptime / 3600);
                const minutes = Math.floor((uptime % 3600) / 60);
                const seconds = Math.floor(uptime % 60);
                
                let infoText = `🖥️ *System Information*\n\n`;
                infoText += `💻 *Platform:* ${os.platform()} ${os.arch()}\n`;
                infoText += `🔧 *Node.js:* ${process.version}\n`;
                infoText += `⏱️ *Uptime:* ${hours}h ${minutes}m ${seconds}s\n`;
                infoText += `💾 *Memory Usage:*\n`;
                infoText += `  • RSS: ${(memUsage.rss / 1024 / 1024).toFixed(2)} MB\n`;
                infoText += `  • Heap Used: ${(memUsage.heapUsed / 1024 / 1024).toFixed(2)} MB\n`;
                infoText += `  • Heap Total: ${(memUsage.heapTotal / 1024 / 1024).toFixed(2)} MB\n`;
                infoText += `🏠 *Free Memory:* ${(os.freemem() / 1024 / 1024 / 1024).toFixed(2)} GB\n`;
                infoText += `📊 *Total Memory:* ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(2)} GB\n`;
                infoText += `⚡ *CPU Cores:* ${os.cpus().length}\n`;
                infoText += `📍 *Hostname:* ${os.hostname()}\n`;
                infoText += `👤 *User:* ${os.userInfo().username}`;

                await sock.sendMessage(message.key.remoteJid, { text: infoText });
            }
        });

        // Restart command (owner only)
        commandManager.register('restart', {
            description: 'Restart the bot (owner only)',
            usage: '.restart',
            role: 'owner',
            category: 'owner',
            handler: async (sock, message, args) => {
                await sock.sendMessage(message.key.remoteJid, {
                    text: '🔄 *Restarting Bot...*\n\nThe bot will restart in a few seconds.'
                });
                
                setTimeout(() => {
                    process.exit(0);
                }, 2000);
            }
        });

        // Eval command (owner only) - for debugging
        commandManager.register('eval', {
            description: 'Execute JavaScript code (dangerous - owner only)',
            usage: '.eval <code>',
            role: 'owner',
            category: 'owner',
            handler: async (sock, message, args) => {
                if (args.length === 0) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '❌ Please provide code to execute.\nExample: .eval console.log("Hello")'
                    });
                    return;
                }

                const code = args.join(' ');
                
                try {
                    let result = eval(code);
                    
                    if (typeof result === 'object') {
                        result = JSON.stringify(result, null, 2);
                    }
                    
                    const resultText = `💻 *Code Execution*\n\n**Input:**\n\`\`\`${code}\`\`\`\n\n**Output:**\n\`\`\`${result || 'undefined'}\`\`\``;
                    
                    await sock.sendMessage(message.key.remoteJid, { text: resultText });
                } catch (error) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `❌ *Execution Error*\n\n\`\`\`${error.message}\`\`\``
                    });
                }
            }
        });
    }
};

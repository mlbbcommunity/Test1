const config = require('../config');
const roleManager = require('./roles');
const visibilityManager = require('./visibilityManager');
const logger = require('./logger');

class CommandManager {
    constructor() {
        this.commands = new Map();
        this.rateLimit = new Map();
        this.registerDefaultCommands();
    }

    /**
     * Register a command
     * @param {string} name - Command name
     * @param {Object} commandConfig - Command configuration
     */
    register(name, commandConfig) {
        this.commands.set(name, {
            name,
            description: commandConfig.description || 'No description',
            usage: commandConfig.usage || `${config.PREFIX}${name}`,
            role: commandConfig.role || 'user',
            handler: commandConfig.handler,
            category: commandConfig.category || 'general'
        });
    }

    /**
     * Check if user is rate limited
     * @param {string} userId - User ID
     * @returns {boolean}
     */
    isRateLimited(userId) {
        const now = Date.now();
        const userLimit = this.rateLimit.get(userId) || { count: 0, resetTime: now + config.RATE_LIMIT_WINDOW };
        
        if (now > userLimit.resetTime) {
            userLimit.count = 1;
            userLimit.resetTime = now + config.RATE_LIMIT_WINDOW;
            this.rateLimit.set(userId, userLimit);
            return false;
        }
        
        if (userLimit.count >= config.RATE_LIMIT_MAX) {
            return true;
        }
        
        userLimit.count++;
        this.rateLimit.set(userId, userLimit);
        return false;
    }

    /**
     * Check if user can access command based on visibility and role
     * @param {string} sender - Sender JID
     * @param {Object} command - Command object
     * @returns {boolean} - Access granted
     */
    canAccessCommand(sender, command) {
        const commandName = command.name;
        
        // Check if command is public (bypasses role restrictions unless explicitly set)
        if (visibilityManager.isPublic(commandName)) {
            // Public commands still respect role if it's explicitly set to admin/owner
            if (command.role === 'admin' || command.role === 'owner') {
                return roleManager.hasPermission(sender, command.role);
            }
            return true; // Public commands accessible to all
        }
        
        // For private commands or default private mode, check role permissions
        if (visibilityManager.isPrivate(commandName) || config.PRIVATE_MODE) {
            return roleManager.hasPermission(sender, command.role);
        }
        
        // Default fallback to role-based access
        return roleManager.hasPermission(sender, command.role);
    }

    /**
     * Execute a command
     * @param {Object} sock - WhatsApp socket
     * @param {Object} message - Message object
     * @param {string} commandName - Command name
     * @param {Array} args - Command arguments
     */
    async execute(sock, message, commandName, args) {
        try {
            const command = this.commands.get(commandName);
            if (!command) {
                return;
            }

            const sender = message.key.remoteJid;
            const senderNumber = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');

            // Check rate limiting (skip for owner)
            if (!roleManager.isOwner(sender) && this.isRateLimited(senderNumber)) {
                await sock.sendMessage(sender, {
                    text: '⚠️ *Rate Limited*\n\nYou are sending commands too quickly. Please wait a moment before trying again.'
                });
                return;
            }

            // Check command access (enhanced with visibility)
            if (!this.canAccessCommand(sender, command)) {
                const visibilityStatus = visibilityManager.getVisibilityStatus(commandName);
                let accessMessage = `❌ *Access Denied*\n\n`;
                
                if (visibilityStatus === 'private') {
                    accessMessage += `This command is private and requires ${command.role} role or higher.\n`;
                } else {
                    accessMessage += `This command requires ${command.role} role or higher.\n`;
                }
                
                accessMessage += `Your role: ${roleManager.getRoleDisplay(sender)}\n`;
                accessMessage += `Command visibility: ${visibilityStatus === 'public' ? '🌐 Public' : '🔒 Private'}`;

                await sock.sendMessage(sender, { text: accessMessage });
                return;
            }

            // Execute command
            await command.handler(sock, message, args);

            logger.info(`Command executed: ${commandName} by ${senderNumber} (${roleManager.getUserRole(sender)})`);

        } catch (error) {
            logger.error(`Error executing command ${commandName}:`, error);
            await sock.sendMessage(message.key.remoteJid, {
                text: '❌ *Command Error*\n\nAn error occurred while executing this command. Please try again later.'
            });
        }
    }

    /**
     * Get command list based on user role and visibility
     * @param {string} sender - Sender JID
     * @returns {Array} - Available commands
     */
    getAvailableCommands(sender) {
        const availableCommands = [];
        
        for (const [name, command] of this.commands) {
            if (this.canAccessCommand(sender, command)) {
                availableCommands.push({
                    ...command,
                    visibility: visibilityManager.getVisibilityStatus(name)
                });
            }
        }
        
        return availableCommands;
    }

    /**
     * Register default bot commands
     */
    registerDefaultCommands() {
        // Ping command
        this.register('ping', {
            description: 'Check if the bot is responsive',
            usage: `${config.PREFIX}ping`,
            role: 'user',
            category: 'general',
            handler: async (sock, message, args) => {
                const start = Date.now();
                const sent = await sock.sendMessage(message.key.remoteJid, {
                    text: '🏓 Pinging...'
                });
                
                const latency = Date.now() - start;
                
                await sock.sendMessage(message.key.remoteJid, {
                    text: `🏓 *Pong!*\n\n⚡ *Latency:* ${latency}ms\n🤖 *Bot:* Online\n⏰ *Uptime:* ${this.getUptime()}\n🔒 *Mode:* ${config.PRIVATE_MODE ? 'Private' : 'Public'}`
                });
            }
        });

        // Menu command
        this.register('menu', {
            description: 'Display available commands',
            usage: `${config.PREFIX}menu`,
            role: 'user',
            category: 'general',
            handler: async (sock, message, args) => {
                const sender = message.key.remoteJid;
                const userRole = roleManager.getUserRole(sender);
                const availableCommands = this.getAvailableCommands(sender);
                
                // Create enhanced menu with visibility indicators
                let menuText = `╭─────────────────────────╮\n`;
                menuText += `│    🤖 *${config.BOT_NAME}*    │\n`;
                menuText += `╰─────────────────────────╯\n\n`;
                
                menuText += `┌─ 👤 *USER INFO* ─┐\n`;
                menuText += `│ Role: ${roleManager.getRoleDisplay(sender)}\n`;
                menuText += `│ Mode: ${config.PRIVATE_MODE ? '🔒 Private' : '🌐 Public'}\n`;
                menuText += `│ Status: ✅ Verified\n`;
                menuText += `└────────────────┘\n\n`;

                const categories = {};
                availableCommands.forEach(cmd => {
                    if (!categories[cmd.category]) {
                        categories[cmd.category] = [];
                    }
                    categories[cmd.category].push(cmd);
                });

                // Category icons mapping
                const categoryIcons = {
                    'general': '🎯',
                    'fun': '🎮',
                    'utility': '🛠️',
                    'admin': '⚙️',
                    'owner': '👑',
                    'imported': '📦'
                };

                for (const [category, commands] of Object.entries(categories)) {
                    const icon = categoryIcons[category] || '📁';
                    menuText += `┌─ ${icon} *${category.toUpperCase()} COMMANDS* ─┐\n`;
                    
                    commands.forEach((cmd, index) => {
                        const isLast = index === commands.length - 1;
                        const prefix = isLast ? '└' : '├';
                        const commandEmoji = this.getCommandEmoji(cmd.name);
                        const visibilityIcon = cmd.visibility === 'public' ? '🌐' : '🔒';
                        menuText += `${prefix} ${commandEmoji} \`${cmd.usage}\` ${visibilityIcon}\n`;
                        menuText += `${isLast ? ' ' : '│'} ↳ ${cmd.description}\n`;
                    });
                    menuText += `└${'─'.repeat(25)}┘\n\n`;
                }

                menuText += `┌─ ℹ️ *INFORMATION* ─┐\n`;
                menuText += `├ 💡 Prefix: \`${config.PREFIX}\`\n`;
                menuText += `├ ⚡ Status: 🟢 Online\n`;
                menuText += `├ 🕐 Time: ${new Date().toLocaleString()}\n`;
                menuText += `├ 📊 Commands: ${availableCommands.length}\n`;
                menuText += `└ 🔒 Visibility: 🌐 Public | 🔒 Private\n`;
                menuText += `└${'─'.repeat(25)}┘\n\n`;
                
                menuText += `╭─────────────────────────╮\n`;
                menuText += `│  💬 Happy Chatting! 🎉  │\n`;
                menuText += `╰─────────────────────────╯`;

                await sock.sendMessage(sender, { text: menuText });
            }
        });

        // Status command (admin only)
        this.register('status', {
            description: 'Check bot status and statistics',
            usage: `${config.PREFIX}status`,
            role: 'admin',
            category: 'admin',
            handler: async (sock, message, args) => {
                const uptime = this.getUptime();
                const memUsage = process.memoryUsage();
                const visibilityStats = visibilityManager.getStats();
                
                let statusText = `📊 *Bot Status*\n\n`;
                statusText += `🤖 *Name:* ${config.BOT_NAME}\n`;
                statusText += `⏰ *Uptime:* ${uptime}\n`;
                statusText += `💾 *Memory Usage:*\n`;
                statusText += `  • RSS: ${Math.round(memUsage.rss / 1024 / 1024)} MB\n`;
                statusText += `  • Heap Used: ${Math.round(memUsage.heapUsed / 1024 / 1024)} MB\n`;
                statusText += `  • Heap Total: ${Math.round(memUsage.heapTotal / 1024 / 1024)} MB\n`;
                statusText += `🔧 *Commands:* ${this.commands.size}\n`;
                statusText += `👥 *Admins:* ${config.ADMIN_NUMBERS.length}\n`;
                statusText += `🌐 *Environment:* ${config.NODE_ENV}\n`;
                statusText += `🔒 *Mode:* ${config.PRIVATE_MODE ? 'Private' : 'Public'}\n`;
                statusText += `📊 *Visibility:*\n`;
                statusText += `  • Public: ${visibilityStats.publicCount}\n`;
                statusText += `  • Private: ${visibilityStats.privateCount}\n`;
                statusText += `📱 *Node.js:* ${process.version}`;

                await sock.sendMessage(message.key.remoteJid, { text: statusText });
            }
        });

        // Admin management commands (owner only)
        this.register('addadmin', {
            description: 'Add a user as admin (mention or reply)',
            usage: `${config.PREFIX}addadmin @user`,
            role: 'owner',
            category: 'owner',
            handler: async (sock, message, args) => {
                const quotedMessage = message.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                const mentionedJid = message.message?.extendedTextMessage?.contextInfo?.mentionedJid?.[0];
                
                let targetNumber;
                
                if (quotedMessage) {
                    targetNumber = message.message.extendedTextMessage.contextInfo.participant || message.message.extendedTextMessage.contextInfo.remoteJid;
                } else if (mentionedJid) {
                    targetNumber = mentionedJid;
                } else if (args.length > 0) {
                    targetNumber = args[0].replace(/[^0-9]/g, '') + '@s.whatsapp.net';
                }
                
                if (!targetNumber) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '❌ Please mention a user or reply to their message to add as admin.'
                    });
                    return;
                }
                
                if (roleManager.addAdmin(targetNumber, message.key.remoteJid)) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `✅ Successfully added user as admin!`
                    });
                } else {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `❌ User is already an admin or error occurred.`
                    });
                }
            }
        });

        // Plugin management commands (admin only)
        this.register('plugins', {
            description: 'List all loaded plugins',
            usage: `${config.PREFIX}plugins`,
            role: 'admin',
            category: 'admin',
            handler: async (sock, message, args) => {
                const pluginManager = require('./pluginManager');
                const plugins = pluginManager.getLoadedPlugins();
                
                if (plugins.length === 0) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '📦 *No Plugins Loaded*\n\nNo plugins are currently active.'
                    });
                    return;
                }

                let pluginText = `📦 *Loaded Plugins (${plugins.length})*\n\n`;
                
                plugins.forEach((plugin, index) => {
                    pluginText += `${index + 1}. **${plugin.name}** v${plugin.version || '1.0.0'}\n`;
                    pluginText += `   📝 ${plugin.description}\n`;
                    pluginText += `   👤 ${plugin.author}\n`;
                    if (plugin.commands && plugin.commands.length > 0) {
                        pluginText += `   🔧 Commands: ${plugin.commands.join(', ')}\n`;
                    }
                    pluginText += `   📅 Loaded: ${plugin.loadedAt?.toLocaleString() || 'Unknown'}\n\n`;
                });

                await sock.sendMessage(message.key.remoteJid, { text: pluginText });
            }
        });

        // Reload plugin command (admin only)
        this.register('reloadplugin', {
            description: 'Reload a specific plugin',
            usage: `${config.PREFIX}reloadplugin <filename>`,
            role: 'admin',
            category: 'admin',
            handler: async (sock, message, args) => {
                if (args.length === 0) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '❌ Please specify a plugin filename to reload.\nExample: .reloadplugin example-plugin.js'
                    });
                    return;
                }

                const fileName = args[0];
                const pluginManager = require('./pluginManager');
                
                const success = await pluginManager.reloadPlugin(fileName);
                
                if (success) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `✅ Successfully reloaded plugin: ${fileName}`
                    });
                } else {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `❌ Failed to reload plugin: ${fileName}\nMake sure the filename is correct.`
                    });
                }
            }
        });

        // Load all plugins command (admin only)
        this.register('loadplugins', {
            description: 'Reload all plugins',
            usage: `${config.PREFIX}loadplugins`,
            role: 'admin',
            category: 'admin',
            handler: async (sock, message, args) => {
                const pluginManager = require('./pluginManager');
                await pluginManager.loadPlugins();
                
                await sock.sendMessage(message.key.remoteJid, {
                    text: '✅ *Plugins Reloaded*\n\nAll plugins have been reloaded successfully.'
                });
            }
        });
    }

    /**
     * Get uptime string
     * @returns {string} - Formatted uptime
     */
    getUptime() {
        const uptime = process.uptime();
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    /**
     * Get command emoji
     * @param {string} commandName - Command name
     * @returns {string} - Emoji for command
     */
    getCommandEmoji(commandName) {
        const emojiMap = {
            'ping': '🏓',
            'menu': '📋',
            'status': '📊',
            'hello': '👋',
            'time': '🕐',
            'joke': '😄',
            'calc': '🧮',
            'qr': '📱',
            'quote': '💭',
            'base64': '🔐',
            'password': '🔑',
            'plugins': '📦',
            'addadmin': '👑',
            'broadcast': '📢',
            'restart': '🔄',
            'eval': '💻',
            'info': '🖥️',
            'importcmd': '📥',
            'zushi': '🌐',
            'ope': '🔒',
            'visibility': '👁️',
            'cmdlist': '📋'
        };
        
        return emojiMap[commandName] || '🔧';
    }
}

module.exports = new CommandManager();
/**
 * Enhanced Admin Tools Plugin for WhatsApp Bot
 * Includes dynamic command importing and visibility management
 */

const visibilityManager = require('../utils/visibilityManager');
const dynamicImporter = require('../utils/dynamicImporter');

module.exports = {
    name: 'Enhanced Admin Tools',
    version: '2.0.0',
    description: 'Advanced admin tools with command importing and visibility management',
    author: 'Bot Developer',

    async init(commandManager) {
        this.registerCommands(commandManager);
        
        return {
            name: this.name,
            version: this.version,
            description: this.description,
            author: this.author,
            commands: ['importcmd', 'zushi', 'ope', 'visibility', 'cmdlist']
        };
    },

    registerCommands(commandManager) {
        // Import command (owner only)
        commandManager.register('importcmd', {
            description: 'Import a custom command from code or GitHub Gist',
            usage: '.importcmd <command_name> [gist_url]\n[Or reply with command code]',
            role: 'owner',
            category: 'owner',
            handler: async (sock, message, args) => {
                if (args.length === 0) {
                    const template = dynamicImporter.getCommandTemplate();
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `📥 *Import Custom Command*\n\n**Method 1 - GitHub Gist:**\n.importcmd <name> <gist_url>\n\n**Method 2 - Direct Code:**\n.importcmd <name>\n[Then reply with your command code]\n\n**Template:**\n\`\`\`javascript\n${template}\`\`\`\n\n**Examples:**\n.importcmd test https://gist.github.com/user/abc123\n.importcmd mycommand\n[Reply with code]`
                    });
                    return;
                }

                const commandName = args[0].toLowerCase();
                const gistUrl = args[1];
                
                // Check if command already exists
                if (commandManager.commands.has(commandName)) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `❌ Command '${commandName}' already exists. Choose a different name.`
                    });
                    return;
                }

                // If URL provided, import directly
                if (gistUrl && (gistUrl.startsWith('http://') || gistUrl.startsWith('https://'))) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `🔄 *Importing from URL...*\n\nCommand: \`${commandName}\`\nSource: ${gistUrl}\n\nPlease wait...`
                    });

                    const result = await dynamicImporter.importCommand(gistUrl, commandName, commandManager);
                    
                    if (result.success) {
                        await sock.sendMessage(message.key.remoteJid, {
                            text: `✅ *Import Successful*\n\n🔧 Command: \`${result.commandName}\`\n📦 Source: GitHub Gist\n📍 Status: Ready to use\n\n💡 Use \`.${result.commandName}\` to test it!\n🌐 Use \`.zushi ${result.commandName}\` to make it public`
                        });
                    } else {
                        await sock.sendMessage(message.key.remoteJid, {
                            text: `❌ *Import Failed*\n\n**Error:** ${result.error}\n\n💡 **Tips:**\n• Check if the Gist URL is correct\n• Make sure the Gist contains valid JavaScript\n• Ensure the command follows the required format`
                        });
                    }
                    return;
                }

                // Store pending import for manual code entry
                const sender = message.key.remoteJid;
                const senderNumber = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');
                
                global.pendingImports = global.pendingImports || new Map();
                global.pendingImports.set(senderNumber, {
                    commandName: commandName,
                    timestamp: Date.now()
                });

                await sock.sendMessage(message.key.remoteJid, {
                    text: `📥 *Ready to Import*\n\nCommand Name: \`${commandName}\`\n\n**Next Step:** Reply to this message with your command code.\n\n⏰ This request expires in 5 minutes.`
                });

                // Clean up pending import after 5 minutes
                setTimeout(() => {
                    if (global.pendingImports && global.pendingImports.has(senderNumber)) {
                        global.pendingImports.delete(senderNumber);
                    }
                }, 5 * 60 * 1000); // 5 minutes
            }
        });

        // Make command public (zushi command)
        commandManager.register('zushi', {
            description: 'Make a command public (accessible to all users)',
            usage: '.zushi <command_name>',
            role: 'owner', // Only owner can make commands public
            category: 'owner',
            handler: async (sock, message, args) => {
                if (args.length === 0) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '🌐 *Make Command Public*\n\nUsage: .zushi <command_name>\n\nExample: .zushi calc\n\nThis will make the command accessible to all users.'
                    });
                    return;
                }

                const commandName = args[0].toLowerCase();
                
                // Check if command exists
                if (!commandManager.commands.has(commandName)) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `❌ Command '${commandName}' not found.`
                    });
                    return;
                }

                const sender = message.key.remoteJid;
                const senderNumber = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');
                
                const success = visibilityManager.makePublic(commandName, senderNumber);
                
                if (success) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `✅ *Command Made Public*\n\n🌐 Command: \`${commandName}\`\nStatus: Now accessible to all users\n\n📋 Use .visibility to see all command visibility settings.`
                    });
                } else {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `❌ Failed to make command '${commandName}' public. It might be a protected system command.`
                    });
                }
            }
        });

        // Make command private (ope command)
        commandManager.register('ope', {
            description: 'Make a command private (restrict access)',
            usage: '.ope <command_name>',
            role: 'admin', // Admin can make commands private
            category: 'admin',
            handler: async (sock, message, args) => {
                if (args.length === 0) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '🔒 *Make Command Private*\n\nUsage: .ope <command_name>\n\nExample: .ope joke\n\nThis will restrict the command based on role permissions.'
                    });
                    return;
                }

                const commandName = args[0].toLowerCase();
                
                // Check if command exists
                if (!commandManager.commands.has(commandName)) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `❌ Command '${commandName}' not found.`
                    });
                    return;
                }

                const sender = message.key.remoteJid;
                const senderNumber = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');
                
                const success = visibilityManager.makePrivate(commandName, senderNumber);
                
                if (success) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `✅ *Command Made Private*\n\n🔒 Command: \`${commandName}\`\nStatus: Now restricted by role permissions\n\n📋 Use .visibility to see all command visibility settings.`
                    });
                } else {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `❌ Failed to make command '${commandName}' private. It might be a protected system command that must remain public.`
                    });
                }
            }
        });

        // Visibility management command
        commandManager.register('visibility', {
            description: 'View and manage command visibility settings',
            usage: '.visibility [list|reset]',
            role: 'admin',
            category: 'admin',
            handler: async (sock, message, args) => {
                const subCommand = args[0]?.toLowerCase();
                
                if (subCommand === 'reset') {
                    visibilityManager.reset();
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '✅ *Visibility Reset*\n\nAll command visibility settings have been reset to defaults.'
                    });
                    return;
                }

                const stats = visibilityManager.getStats();
                const publicCommands = visibilityManager.getPublicCommands();
                const privateCommands = visibilityManager.getPrivateCommands();
                
                let visibilityText = `👁️ *Command Visibility Status*\n\n`;
                visibilityText += `📊 **Statistics:**\n`;
                visibilityText += `• Default Mode: ${stats.defaultMode === 'private' ? '🔒 Private' : '🌐 Public'}\n`;
                visibilityText += `• Public Commands: ${stats.publicCount}\n`;
                visibilityText += `• Private Commands: ${stats.privateCount}\n\n`;
                
                if (publicCommands.length > 0) {
                    visibilityText += `🌐 **Public Commands:**\n`;
                    publicCommands.forEach(cmd => {
                        visibilityText += `• \`${cmd}\`\n`;
                    });
                    visibilityText += `\n`;
                }

                if (privateCommands.length > 0) {
                    visibilityText += `🔒 **Private Commands:**\n`;
                    privateCommands.forEach(cmd => {
                        visibilityText += `• \`${cmd}\`\n`;
                    });
                    visibilityText += `\n`;
                }
                
                visibilityText += `💡 **Commands:**\n`;
                visibilityText += `• \`.zushi <cmd>\` - Make public\n`;
                visibilityText += `• \`.ope <cmd>\` - Make private\n`;
                visibilityText += `• \`.visibility reset\` - Reset all`;

                await sock.sendMessage(message.key.remoteJid, { text: visibilityText });
            }
        });

        // List imported commands
        commandManager.register('cmdlist', {
            description: 'List all imported custom commands',
            usage: '.cmdlist [remove <name>]',
            role: 'owner',
            category: 'owner',
            handler: async (sock, message, args) => {
                const subCommand = args[0]?.toLowerCase();
                
                if (subCommand === 'remove' && args[1]) {
                    const commandName = args[1].toLowerCase();
                    const success = dynamicImporter.removeImportedCommand(commandName, commandManager);
                    
                    if (success) {
                        await sock.sendMessage(message.key.remoteJid, {
                            text: `✅ *Command Removed*\n\nRemoved imported command: \`${commandName}\``
                        });
                    } else {
                        await sock.sendMessage(message.key.remoteJid, {
                            text: `❌ Command '${commandName}' not found or not imported.`
                        });
                    }
                    return;
                }

                const importedCommands = dynamicImporter.getImportedCommands();
                
                if (importedCommands.length === 0) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '📦 *No Imported Commands*\n\nNo custom commands have been imported yet.\n\nUse `.importcmd <name>` to import a command.'
                    });
                    return;
                }

                let listText = `📦 *Imported Commands (${importedCommands.length})*\n\n`;
                
                importedCommands.forEach((cmd, index) => {
                    const visibilityStatus = visibilityManager.getVisibilityStatus(cmd.name);
                    const visibilityIcon = visibilityStatus === 'public' ? '🌐' : '🔒';
                    
                    listText += `${index + 1}. **${cmd.name}** ${visibilityIcon}\n`;
                    listText += `   📅 Imported: ${cmd.importedAt.toLocaleString()}\n`;
                    listText += `   👁️ Visibility: ${visibilityStatus}\n\n`;
                });

                listText += `💡 **Commands:**\n`;
                listText += `• \`.cmdlist remove <name>\` - Remove command\n`;
                listText += `• \`.zushi <name>\` - Make public\n`;
                listText += `• \`.ope <name>\` - Make private`;

                await sock.sendMessage(message.key.remoteJid, { text: listText });
            }
        });
    }
};
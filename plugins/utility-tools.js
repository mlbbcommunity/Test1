/**
 * Utility Tools Plugin for WhatsApp Bot
 * Useful utility commands for users
 */

module.exports = {
    name: 'Utility Tools',
    version: '1.0.0',
    description: 'Collection of useful utility commands',
    author: 'Bot Developer',

    async init(commandManager) {
        this.registerCommands(commandManager);
        
        return {
            name: this.name,
            version: this.version,
            description: this.description,
            author: this.author,
            commands: ['calc', 'qr', 'quote', 'base64', 'password']
        };
    },

    registerCommands(commandManager) {
        // Calculator command
        commandManager.register('calc', {
            description: 'Perform mathematical calculations',
            usage: '.calc <expression>',
            role: 'user',
            category: 'utility',
            handler: async (sock, message, args) => {
                if (args.length === 0) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '🧮 *Calculator*\n\nUsage: .calc <expression>\nExample: .calc 2 + 2 * 3'
                    });
                    return;
                }

                const expression = args.join(' ');
                
                try {
                    // Sanitize input to prevent code injection
                    const sanitized = expression.replace(/[^0-9+\-*/.() ]/g, '');
                    
                    if (sanitized !== expression) {
                        await sock.sendMessage(message.key.remoteJid, {
                            text: '❌ Invalid characters in expression. Only numbers and basic operators (+, -, *, /, (, )) are allowed.'
                        });
                        return;
                    }

                    const result = eval(sanitized);
                    
                    await sock.sendMessage(message.key.remoteJid, {
                        text: `🧮 *Calculator*\n\n**Expression:** ${expression}\n**Result:** ${result}`
                    });
                } catch (error) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '❌ Invalid mathematical expression. Please check your syntax.'
                    });
                }
            }
        });

        // QR Code generator command
        commandManager.register('qr', {
            description: 'Generate QR code for text',
            usage: '.qr <text>',
            role: 'user',
            category: 'utility',
            handler: async (sock, message, args) => {
                if (args.length === 0) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '📱 *QR Code Generator*\n\nUsage: .qr <text>\nExample: .qr https://example.com'
                    });
                    return;
                }

                const text = args.join(' ');
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(text)}`;
                
                try {
                    await sock.sendMessage(message.key.remoteJid, {
                        image: { url: qrUrl },
                        caption: `📱 *QR Code Generated*\n\n**Text:** ${text}\n\nScan this QR code to access the content.`
                    });
                } catch (error) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '❌ Failed to generate QR code. Please try again later.'
                    });
                }
            }
        });

        // Random quote command
        commandManager.register('quote', {
            description: 'Get an inspirational quote',
            usage: '.quote',
            role: 'user',
            category: 'fun',
            handler: async (sock, message, args) => {
                const quotes = [
                    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
                    { text: "Innovation distinguishes between a leader and a follower.", author: "Steve Jobs" },
                    { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon" },
                    { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
                    { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
                    { text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
                    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
                    { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
                    { text: "Don't let yesterday take up too much of today.", author: "Will Rogers" },
                    { text: "You learn more from failure than from success. Don't let it stop you. Failure builds character.", author: "Unknown" }
                ];

                const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
                
                await sock.sendMessage(message.key.remoteJid, {
                    text: `💭 *Quote of the Day*\n\n"${randomQuote.text}"\n\n— ${randomQuote.author}`
                });
            }
        });

        // Base64 encode/decode command
        commandManager.register('base64', {
            description: 'Encode or decode base64 text',
            usage: '.base64 <encode|decode> <text>',
            role: 'user',
            category: 'utility',
            handler: async (sock, message, args) => {
                if (args.length < 2) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '🔐 *Base64 Encoder/Decoder*\n\nUsage:\n• .base64 encode <text>\n• .base64 decode <base64>'
                    });
                    return;
                }

                const operation = args[0].toLowerCase();
                const text = args.slice(1).join(' ');

                try {
                    let result;
                    
                    if (operation === 'encode') {
                        result = Buffer.from(text).toString('base64');
                        await sock.sendMessage(message.key.remoteJid, {
                            text: `🔐 *Base64 Encoded*\n\n**Original:** ${text}\n**Encoded:** ${result}`
                        });
                    } else if (operation === 'decode') {
                        result = Buffer.from(text, 'base64').toString('utf-8');
                        await sock.sendMessage(message.key.remoteJid, {
                            text: `🔓 *Base64 Decoded*\n\n**Encoded:** ${text}\n**Decoded:** ${result}`
                        });
                    } else {
                        await sock.sendMessage(message.key.remoteJid, {
                            text: '❌ Invalid operation. Use "encode" or "decode".'
                        });
                    }
                } catch (error) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '❌ Invalid base64 string or encoding error.'
                    });
                }
            }
        });

        // Random password generator
        commandManager.register('password', {
            description: 'Generate a secure random password',
            usage: '.password [length]',
            role: 'user',
            category: 'utility',
            handler: async (sock, message, args) => {
                const length = args.length > 0 ? parseInt(args[0]) : 12;
                
                if (length < 4 || length > 50) {
                    await sock.sendMessage(message.key.remoteJid, {
                        text: '❌ Password length must be between 4 and 50 characters.'
                    });
                    return;
                }

                const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
                let password = '';
                
                for (let i = 0; i < length; i++) {
                    password += charset.charAt(Math.floor(Math.random() * charset.length));
                }

                await sock.sendMessage(message.key.remoteJid, {
                    text: `🔐 *Generated Password*\n\n**Length:** ${length} characters\n**Password:** \`${password}\`\n\n⚠️ *Security Note:* Save this password securely and delete this message.`
                });
            }
        });
    }
};

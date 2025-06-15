/**
 * Example Plugin for WhatsApp Bot
 * This demonstrates how to create a plugin with custom commands
 */

module.exports = {
    // Plugin metadata
    name: 'Example Plugin',
    version: '1.0.0',
    description: 'Demonstrates plugin functionality with example commands',
    author: 'Bot Developer',

    /**
     * Initialize the plugin
     * @param {Object} commandManager - Command manager instance
     * @returns {Object} - Plugin information
     */
    async init(commandManager) {
        // Register custom commands
        this.registerCommands(commandManager);
        
        return {
            name: this.name,
            version: this.version,
            description: this.description,
            author: this.author,
            commands: ['hello', 'time', 'joke']
        };
    },

    /**
     * Register plugin commands
     * @param {Object} commandManager - Command manager instance
     */
    registerCommands(commandManager) {
        // Hello command
        commandManager.register('hello', {
            description: 'Send a personalized greeting',
            usage: '.hello [name]',
            role: 'user',
            category: 'fun',
            handler: async (sock, message, args) => {
                const name = args.length > 0 ? args.join(' ') : 'Friend';
                const greetings = [
                    `Hello ${name}! 👋`,
                    `Hi there ${name}! 🌟`,
                    `Greetings ${name}! ✨`,
                    `Hey ${name}! How's it going? 😊`
                ];
                
                const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
                
                await sock.sendMessage(message.key.remoteJid, {
                    text: `🤖 *Bot Says:*\n\n${randomGreeting}`
                });
            }
        });

        // Time command
        commandManager.register('time', {
            description: 'Get current server time',
            usage: '.time',
            role: 'user',
            category: 'utility',
            handler: async (sock, message, args) => {
                const now = new Date();
                const timeString = now.toLocaleString('en-US', {
                    timeZone: 'UTC',
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                });

                await sock.sendMessage(message.key.remoteJid, {
                    text: `🕐 *Current Server Time*\n\n📅 ${timeString} UTC\n\n⏰ Unix Timestamp: ${now.getTime()}`
                });
            }
        });

        // Joke command
        commandManager.register('joke', {
            description: 'Get a random programming joke',
            usage: '.joke',
            role: 'user',
            category: 'fun',
            handler: async (sock, message, args) => {
                const jokes = [
                    "Why do programmers prefer dark mode? Because light attracts bugs!",
                    "How many programmers does it take to change a light bulb? None, that's a hardware problem!",
                    "Why do Java developers wear glasses? Because they don't see sharp!",
                    "What's a programmer's favorite hangout place? The Foo Bar!",
                    "Why did the programmer quit his job? He didn't get arrays!",
                    "What do you call a programmer from Finland? Nerdic!",
                    "Why do programmers always mix up Halloween and Christmas? Because Oct 31 equals Dec 25!",
                    "What's the best part about TCP jokes? I get to keep telling them until you get them!"
                ];

                const randomJoke = jokes[Math.floor(Math.random() * jokes.length)];

                await sock.sendMessage(message.key.remoteJid, {
                    text: `😄 *Programming Joke*\n\n${randomJoke}`
                });
            }
        });
    }
};

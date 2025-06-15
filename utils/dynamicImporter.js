const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const logger = require('./logger');

class DynamicImporter {
    constructor() {
        this.importedCommands = new Map();
    }

    /**
     * Fetch code from URL
     * @param {string} url - URL to fetch code from
     * @returns {Promise<string>} - Fetched code
     */
    async fetchFromUrl(url) {
        return new Promise((resolve, reject) => {
            const client = url.startsWith('https:') ? https : http;
            
            client.get(url, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
                    return;
                }
                
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(data));
            }).on('error', reject);
        });
    }

    /**
     * Convert GitHub Gist URL to raw URL
     * @param {string} url - GitHub Gist URL
     * @returns {string} - Raw content URL
     */
    convertGistUrl(url) {
        // Convert gist.github.com URLs to raw content URLs
        if (url.includes('gist.github.com')) {
            // Extract gist ID and filename
            const gistMatch = url.match(/gist\.github\.com\/[^\/]+\/([a-f0-9]+)/);
            if (gistMatch) {
                const gistId = gistMatch[1];
                // Use GitHub's raw gist API
                return `https://gist.githubusercontent.com/${gistId}/raw`;
            }
        }
        return url; // Return original if not a gist URL
    }

    /**
     * Import a command from text/code or URL
     * @param {string} commandCodeOrUrl - JavaScript code or URL to code
     * @param {string} commandName - Name of the command
     * @param {Object} commandManager - Command manager instance
     * @returns {Object} - Import result
     */
    async importCommand(commandCodeOrUrl, commandName, commandManager) {
        try {
            // Basic validation
            if (!commandCodeOrUrl || !commandName) {
                return {
                    success: false,
                    error: 'Command code/URL and name are required'
                };
            }

            let commandCode = commandCodeOrUrl;

            // Check if input is a URL
            if (commandCodeOrUrl.startsWith('http://') || commandCodeOrUrl.startsWith('https://')) {
                try {
                    const rawUrl = this.convertGistUrl(commandCodeOrUrl);
                    commandCode = await this.fetchFromUrl(rawUrl);
                    logger.info(`Successfully fetched command code from URL: ${commandCodeOrUrl}`);
                } catch (error) {
                    return {
                        success: false,
                        error: `Failed to fetch code from URL: ${error.message}`
                    };
                }
            }

            // Sanitize command name
            const sanitizedName = commandName.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!sanitizedName) {
                return {
                    success: false,
                    error: 'Invalid command name'
                };
            }

            // Validate command structure
            const validationResult = this.validateCommandStructure(commandCode);
            if (!validationResult.valid) {
                return {
                    success: false,
                    error: validationResult.error
                };
            }

            // Create temporary file path
            const tempFileName = `temp_${sanitizedName}_${Date.now()}.js`;
            const tempFilePath = path.join(__dirname, '../plugins', tempFileName);

            // Write command to temporary file
            fs.writeFileSync(tempFilePath, commandCode);

            try {
                // Clear require cache
                delete require.cache[require.resolve(tempFilePath)];
                
                // Require the command
                const commandModule = require(tempFilePath);
                
                // Validate the command module
                if (typeof commandModule !== 'object' || typeof commandModule.handler !== 'function') {
                    throw new Error('Command must export an object with a handler function');
                }

                // Register the command
                commandManager.register(sanitizedName, {
                    description: commandModule.description || 'Imported command',
                    usage: commandModule.usage || `.${sanitizedName}`,
                    role: commandModule.role || 'user',
                    category: commandModule.category || 'imported',
                    handler: commandModule.handler
                });

                // Store import info
                this.importedCommands.set(sanitizedName, {
                    name: sanitizedName,
                    importedAt: new Date(),
                    tempFile: tempFilePath,
                    originalCode: commandCode
                });

                logger.info(`Successfully imported command: ${sanitizedName}`);

                return {
                    success: true,
                    commandName: sanitizedName,
                    message: `Command '${sanitizedName}' imported successfully`
                };

            } finally {
                // Clean up temporary file
                if (fs.existsSync(tempFilePath)) {
                    fs.unlinkSync(tempFilePath);
                }
            }

        } catch (error) {
            logger.error('Error importing command:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Validate command structure
     * @param {string} commandCode - Command code to validate
     * @returns {Object} - Validation result
     */
    validateCommandStructure(commandCode) {
        try {
            // Basic syntax check
            if (!commandCode.includes('module.exports') && !commandCode.includes('exports')) {
                return {
                    valid: false,
                    error: 'Command must use module.exports or exports'
                };
            }

            // Check for required handler function
            if (!commandCode.includes('handler')) {
                return {
                    valid: false,
                    error: 'Command must have a handler function'
                };
            }

            // Check for dangerous functions
            const dangerousFunctions = [
                'process.exit',
                'require(\'fs\')',
                'require("fs")',
                'require(\'child_process\')',
                'require("child_process")',
                'eval(',
                'Function(',
                '__dirname',
                'process.env'
            ];

            for (const dangerous of dangerousFunctions) {
                if (commandCode.includes(dangerous)) {
                    return {
                        valid: false,
                        error: `Command contains potentially dangerous code: ${dangerous}`
                    };
                }
            }

            return { valid: true };

        } catch (error) {
            return {
                valid: false,
                error: 'Invalid JavaScript syntax'
            };
        }
    }

    /**
     * Get list of imported commands
     * @returns {Array} - List of imported commands
     */
    getImportedCommands() {
        return Array.from(this.importedCommands.values());
    }

    /**
     * Remove an imported command
     * @param {string} commandName - Command name to remove
     * @param {Object} commandManager - Command manager instance
     * @returns {boolean} - Success status
     */
    removeImportedCommand(commandName, commandManager) {
        try {
            if (this.importedCommands.has(commandName)) {
                // Remove from command manager
                commandManager.commands.delete(commandName);
                
                // Remove from imported commands
                this.importedCommands.delete(commandName);
                
                logger.info(`Removed imported command: ${commandName}`);
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`Error removing imported command ${commandName}:`, error);
            return false;
        }
    }

    /**
     * Get command template/example
     * @returns {string} - Command template
     */
    getCommandTemplate() {
        return `module.exports = {
    description: 'Your command description',
    usage: '.yourcommand [args]',
    role: 'user', // user, admin, owner
    category: 'custom',
    handler: async (sock, message, args) => {
        // Your command logic here
        const text = args.length > 0 ? args.join(' ') : 'Hello World!';
        
        await sock.sendMessage(message.key.remoteJid, {
            text: \`🤖 *Your Command*\\n\\n\${text}\`
        });
    }
};`;
    }
}

module.exports = new DynamicImporter();
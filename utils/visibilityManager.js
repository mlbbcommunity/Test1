const logger = require('./logger');
const config = require('../config');

class VisibilityManager {
    constructor() {
        // In-memory storage for command visibility
        // In production, you might want to use a database
        this.publicCommands = new Set();
        this.privateCommands = new Set();
        
        // Default public commands (always accessible)
        this.defaultPublicCommands = ['ping', 'menu'];
        this.publicCommands = new Set(this.defaultPublicCommands);
    }

    /**
     * Make a command public (accessible to all users)
     * @param {string} commandName - Command name
     * @param {string} requesterNumber - Number of user making the request
     * @returns {boolean} - Success status
     */
    makePublic(commandName, requesterNumber) {
        try {
            // Remove from private set and add to public set
            this.privateCommands.delete(commandName);
            this.publicCommands.add(commandName);
            
            logger.info(`Command '${commandName}' made public by ${requesterNumber}`);
            return true;
        } catch (error) {
            logger.error('Error making command public:', error);
            return false;
        }
    }

    /**
     * Make a command private (restricted access)
     * @param {string} commandName - Command name
     * @param {string} requesterNumber - Number of user making the request
     * @returns {boolean} - Success status
     */
    makePrivate(commandName, requesterNumber) {
        try {
            // Don't allow making default public commands private
            if (this.defaultPublicCommands.includes(commandName)) {
                return false;
            }
            
            // Remove from public set and add to private set
            this.publicCommands.delete(commandName);
            this.privateCommands.add(commandName);
            
            logger.info(`Command '${commandName}' made private by ${requesterNumber}`);
            return true;
        } catch (error) {
            logger.error('Error making command private:', error);
            return false;
        }
    }

    /**
     * Check if a command is public
     * @param {string} commandName - Command name
     * @returns {boolean} - True if public
     */
    isPublic(commandName) {
        return this.publicCommands.has(commandName);
    }

    /**
     * Check if a command is private
     * @param {string} commandName - Command name
     * @returns {boolean} - True if private
     */
    isPrivate(commandName) {
        return this.privateCommands.has(commandName) || 
               (!this.publicCommands.has(commandName) && config.PRIVATE_MODE);
    }

    /**
     * Get all public commands
     * @returns {Array} - Array of public command names
     */
    getPublicCommands() {
        return Array.from(this.publicCommands);
    }

    /**
     * Get all private commands
     * @returns {Array} - Array of private command names
     */
    getPrivateCommands() {
        return Array.from(this.privateCommands);
    }

    /**
     * Get visibility status of a command
     * @param {string} commandName - Command name
     * @returns {string} - 'public', 'private', or 'default'
     */
    getVisibilityStatus(commandName) {
        if (this.publicCommands.has(commandName)) {
            return 'public';
        }
        if (this.privateCommands.has(commandName)) {
            return 'private';
        }
        return config.PRIVATE_MODE ? 'private' : 'public';
    }

    /**
     * Reset command visibility to defaults
     */
    reset() {
        this.publicCommands = new Set(this.defaultPublicCommands);
        this.privateCommands.clear();
        logger.info('Command visibility reset to defaults');
    }

    /**
     * Get visibility statistics
     * @returns {Object} - Visibility statistics
     */
    getStats() {
        return {
            publicCount: this.publicCommands.size,
            privateCount: this.privateCommands.size,
            defaultMode: config.PRIVATE_MODE ? 'private' : 'public'
        };
    }
}

module.exports = new VisibilityManager();
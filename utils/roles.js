const config = require('../config');
const logger = require('./logger');

class RoleManager {
    constructor() {
        this.roles = {
            OWNER: 'owner',
            ADMIN: 'admin',
            USER: 'user'
        };
    }

    /**
     * Get user role based on phone number
     * @param {string} phoneNumber - User's phone number
     * @returns {string} - User role
     */
    getUserRole(phoneNumber) {
        try {
            // Extract number from JID format
            const number = phoneNumber.replace('@s.whatsapp.net', '').replace('@c.us', '');
            
            // Check if owner
            if (number === config.OWNER_NUMBER) {
                return this.roles.OWNER;
            }
            
            // Check if admin
            if (config.ADMIN_NUMBERS.includes(number)) {
                return this.roles.ADMIN;
            }
            
            // Default to user
            return this.roles.USER;
        } catch (error) {
            logger.error('Error determining user role:', error);
            return this.roles.USER;
        }
    }

    /**
     * Check if user is owner
     * @param {string} phoneNumber - User's phone number
     * @returns {boolean}
     */
    isOwner(phoneNumber) {
        return this.getUserRole(phoneNumber) === this.roles.OWNER;
    }

    /**
     * Check if user is admin or higher
     * @param {string} phoneNumber - User's phone number
     * @returns {boolean}
     */
    isAdmin(phoneNumber) {
        const role = this.getUserRole(phoneNumber);
        return role === this.roles.ADMIN || role === this.roles.OWNER;
    }

    /**
     * Check if user has required permission level
     * @param {string} phoneNumber - User's phone number
     * @param {string} requiredRole - Required role level
     * @returns {boolean}
     */
    hasPermission(phoneNumber, requiredRole) {
        const userRole = this.getUserRole(phoneNumber);
        
        switch (requiredRole) {
            case this.roles.OWNER:
                return userRole === this.roles.OWNER;
            case this.roles.ADMIN:
                return userRole === this.roles.ADMIN || userRole === this.roles.OWNER;
            case this.roles.USER:
                return true; // All users have user level access
            default:
                return false;
        }
    }

    /**
     * Get role display name
     * @param {string} phoneNumber - User's phone number
     * @returns {string}
     */
    getRoleDisplay(phoneNumber) {
        const role = this.getUserRole(phoneNumber);
        switch (role) {
            case this.roles.OWNER:
                return '👑 Owner';
            case this.roles.ADMIN:
                return '⭐ Admin';
            case this.roles.USER:
                return '👤 User';
            default:
                return '❓ Unknown';
        }
    }

    /**
     * Add user to admin list (owner only)
     * @param {string} phoneNumber - Phone number to add as admin
     * @param {string} requesterNumber - Phone number of requester
     * @returns {boolean}
     */
    addAdmin(phoneNumber, requesterNumber) {
        if (!this.isOwner(requesterNumber)) {
            return false;
        }

        const number = phoneNumber.replace(/[^0-9]/g, '');
        if (!config.ADMIN_NUMBERS.includes(number)) {
            config.ADMIN_NUMBERS.push(number);
            logger.info(`Added ${number} as admin by ${requesterNumber}`);
            return true;
        }
        
        return false; // Already admin
    }

    /**
     * Remove user from admin list (owner only)
     * @param {string} phoneNumber - Phone number to remove from admin
     * @param {string} requesterNumber - Phone number of requester
     * @returns {boolean}
     */
    removeAdmin(phoneNumber, requesterNumber) {
        if (!this.isOwner(requesterNumber)) {
            return false;
        }

        const number = phoneNumber.replace(/[^0-9]/g, '');
        const index = config.ADMIN_NUMBERS.indexOf(number);
        
        if (index > -1) {
            config.ADMIN_NUMBERS.splice(index, 1);
            logger.info(`Removed ${number} from admin by ${requesterNumber}`);
            return true;
        }
        
        return false; // Not admin
    }
}

module.exports = new RoleManager();
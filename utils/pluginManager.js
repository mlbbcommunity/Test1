const fs = require('fs');
const path = require('path');
const logger = require('./logger');
const commandManager = require('./commands');

class PluginManager {
    constructor() {
        this.pluginsDir = path.join(__dirname, '../plugins');
        this.loadedPlugins = new Map();
    }

    /**
     * Load all plugins from the plugins directory
     */
    async loadPlugins() {
        try {
            if (!fs.existsSync(this.pluginsDir)) {
                logger.info('Plugins directory not found, creating...');
                fs.mkdirSync(this.pluginsDir, { recursive: true });
                return;
            }

            const files = fs.readdirSync(this.pluginsDir);
            const pluginFiles = files.filter(file => 
                file.endsWith('.js') && !file.startsWith('.')
            );

            if (pluginFiles.length === 0) {
                logger.info('No plugins found in plugins directory');
                return;
            }

            logger.info(`Loading ${pluginFiles.length} plugin(s)...`);

            for (const file of pluginFiles) {
                await this.loadPlugin(file);
            }

            logger.info(`Successfully loaded ${this.loadedPlugins.size} plugin(s)`);
        } catch (error) {
            logger.error('Error loading plugins:', error);
        }
    }

    /**
     * Load a single plugin file
     * @param {string} fileName - Plugin file name
     */
    async loadPlugin(fileName) {
        try {
            const pluginPath = path.join(this.pluginsDir, fileName);
            
            // Clear require cache to allow hot reloading
            delete require.cache[require.resolve(pluginPath)];
            
            const plugin = require(pluginPath);
            
            if (!plugin || typeof plugin.init !== 'function') {
                logger.error(`Invalid plugin format: ${fileName} - must export an init function`);
                return;
            }

            // Initialize plugin
            const pluginInfo = await plugin.init(commandManager);
            
            if (pluginInfo && pluginInfo.name) {
                this.loadedPlugins.set(fileName, {
                    ...pluginInfo,
                    fileName,
                    loadedAt: new Date()
                });
                
                logger.info(`Plugin loaded: ${pluginInfo.name} v${pluginInfo.version || '1.0.0'}`);
            }
        } catch (error) {
            logger.error(`Error loading plugin ${fileName}:`, error);
        }
    }

    /**
     * Reload a specific plugin
     * @param {string} fileName - Plugin file name
     */
    async reloadPlugin(fileName) {
        try {
            if (this.loadedPlugins.has(fileName)) {
                logger.info(`Reloading plugin: ${fileName}`);
                await this.loadPlugin(fileName);
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`Error reloading plugin ${fileName}:`, error);
            return false;
        }
    }

    /**
     * Get list of loaded plugins
     * @returns {Array} - Array of plugin information
     */
    getLoadedPlugins() {
        return Array.from(this.loadedPlugins.values());
    }

    /**
     * Get plugin by name
     * @param {string} name - Plugin name
     * @returns {Object|null} - Plugin info or null
     */
    getPlugin(name) {
        for (const plugin of this.loadedPlugins.values()) {
            if (plugin.name === name) {
                return plugin;
            }
        }
        return null;
    }

    /**
     * Unload a plugin
     * @param {string} fileName - Plugin file name
     * @returns {boolean} - Success status
     */
    unloadPlugin(fileName) {
        try {
            if (this.loadedPlugins.has(fileName)) {
                const plugin = this.loadedPlugins.get(fileName);
                
                // Remove plugin commands from command manager
                if (plugin.commands) {
                    plugin.commands.forEach(cmdName => {
                        commandManager.commands.delete(cmdName);
                    });
                }
                
                this.loadedPlugins.delete(fileName);
                logger.info(`Plugin unloaded: ${plugin.name}`);
                return true;
            }
            return false;
        } catch (error) {
            logger.error(`Error unloading plugin ${fileName}:`, error);
            return false;
        }
    }

    /**
     * Watch plugins directory for changes (if needed for hot reloading)
     */
    watchPlugins() {
        try {
            if (!fs.existsSync(this.pluginsDir)) {
                return;
            }

            fs.watch(this.pluginsDir, (eventType, fileName) => {
                if (fileName && fileName.endsWith('.js')) {
                    logger.info(`Plugin file changed: ${fileName} - ${eventType}`);
                    
                    if (eventType === 'change') {
                        setTimeout(() => {
                            this.reloadPlugin(fileName);
                        }, 1000); // Delay to ensure file is fully written
                    }
                }
            });

            logger.info('Plugin hot reloading enabled');
        } catch (error) {
            logger.error('Error setting up plugin watcher:', error);
        }
    }
}

module.exports = new PluginManager();
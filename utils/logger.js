const pino = require('pino');
const config = require('../config');

// Create logger instance
const logger = pino({
    level: config.LOG_LEVEL,
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
            singleLine: true
        }
    },
    base: {
        env: config.NODE_ENV,
        bot: config.BOT_NAME
    }
});

module.exports = logger;
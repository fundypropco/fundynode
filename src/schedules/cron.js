const cron = require('node-cron');
const logger = require('../helpers/logger')

cron.schedule('*/5 * * * * *', () => {
    logger.warn("warn", new Date().toLocaleDateString());
});
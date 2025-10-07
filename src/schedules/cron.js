import cron from 'node-cron'
import logger from '../helpers/logger'

cron.schedule('*/5 * * * * *', () => {
    logger.warn("warn", new Date().toLocaleDateString());
});
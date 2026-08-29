import TradeMap from "../models/TradeMap.js"
import logger from "../helpers/logger.js"
import axios from "axios"
import md5 from 'md5';

const sync = async ({ event, data }) => {
    try {
        const utcDate = new Date().toISOString().slice(0, 10);

        await axios.post(
            "https://panel.fundyprop.com/api/sync-trade",
            { event, data },
            {
                timeout: 10000,
                headers: {
                    //Authorization: `Bearer ${process.env.LARAVEL_SYNC_TOKEN}`,
                    'X-API-Key': md5(utcDate),
                    'Content-Type': "application/json"
                }
            }
        )
    } catch (err) {
        logger.error(`[TradeMapService] ${event} failed: ${err}`)
        logger.error(err.code)
        logger.error(err.response?.status)
        logger.error(err.response?.data)
    }
}

export default {
    sync,
}
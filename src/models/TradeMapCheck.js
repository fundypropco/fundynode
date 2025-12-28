import mongoose from "mongoose"

const tradeMapCheckSchema = new mongoose.Schema({

    server_src: {
        type: String
    },
    acc_src: {
        type: Number,
        index: true
    },
    ticket_src: {
        type: Number,
        index: true
    },

    server_dist: {
        type: String
    },
    acc_dist: {
        type: Number,
        index: true
    },
    ticket_dist: {
        type: Number,
        default: null
    },

    desc: {
        type: String
    },
    datetime: {
        type: String
    },
    timestamp: {
        type: Number,
        index: true
    },

    notified: {
        type: Boolean,
        default: false
    }
})

const TradeMapCheck = mongoose.model('TradeMapCheck', tradeMapCheckSchema, 'trade_map_checks');

export default TradeMapCheck

export async function createTradeMapCheckIndexes() {
    try {
        await TradeMapCheck.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing TradeMapCheck indexes:", err);
    }
}
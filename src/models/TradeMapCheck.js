import mongoose from "mongoose"

const tradeMapCheckSchema = new mongoose.Schema({

    server_src: {
        type: String
    },
    acc_src: {
        type: Number,
    },
    ticket_src: {
        type: Number,
    },

    server_dist: {
        type: String
    },
    acc_dist: {
        type: Number,
    },
    ticket_dist: {
        type: Number,
        default: null
    },

    type: {
        type: String,
        enum: ['existence', 'mismatch']
    },

    desc: {
        type: String
    },
    datetime: {
        type: String
    },
    timestamp: {
        type: Number,
    },

    notified: {
        type: Boolean,
        default: false
    }
})

tradeMapCheckSchema.index({ acc_src: 1, ticket_src: 1, acc_dist: 1, ticket_dist: 1, type: 1 }, { unique: true })

const TradeMapCheck = mongoose.model('TradeMapCheck', tradeMapCheckSchema, 'trade_map_checks');

export default TradeMapCheck

export async function createTradeMapCheckIndexes() {
    try {
        await TradeMapCheck.createIndexes();
    } catch (err) {
        console.error("❌ Error Syncing TradeMapCheck indexes:", err);
    }
}
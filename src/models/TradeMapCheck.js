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
        type: String,
    },
    acc_dist: {
        type: Number,
        index: true
    },
    ticket_dist: {
        type: Number,
        default: null,
    },

    desc: {
        type: String
    },
    time: {
        type: String
    },
    timestamp: {
        type: Number
    }
});

tradeMapSchema.index({ acc_src: 1, ticket_src: 1, acc_dist: 1, ticket_dist: 1 })
tradeMapSchema.index({ acc_src: 1, acc_dist: 1, status: 1 })
tradeMapSchema.index({ acc_dist: 1, ticket_dist: 1 })

const TradeMap = mongoose.model('TradeMap', tradeMapSchema, 'trade_maps');

export default TradeMap

export async function createTradeMapIndexes() {
    try {
        await TradeMap.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
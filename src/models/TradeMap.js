import mongoose from "mongoose"

const tradeMapSchema = new mongoose.Schema({
    server_src: {
        type: String
    },
    acc_src: {
        type: Number,
    },
    ticket_src: {
        type: Number
    },
    symbol_src: {
        type: String
    },
    vol_src: {
        type: Number
    },
    open_price_src: {
        type: Number
    },
    open_time_src: {
        type: String
    },
    sl_src: {
        type: Number
    },
    tp_src: {
        type: Number
    },
    close_price_src: {
        type: Number
    },
    close_time_src: {
        type: String,
        default: ''
    },

    acc_dist: {
        type: Number
    },
    ticket_dist: {
        type: Number
    },
    server_dist: {
        type: String
    },
    symbol_dist: {
        type: String
    },
    vol_dist: {
        type: Number
    },
    open_price_dist: {
        type: Number
    },
    open_time_dist: {
        type: String,
    },
    sl_dist: {
        type: Number
    },
    tp_dist: {
        type: Number
    },
    close_price_dist: {
        type: Number
    },
    close_time_dist: {
        type: String,
        default: '',
    },

    symbol_title: {
        type: String
    },
    symbol_weight: {
        type: Number,
        default: 0,
        index: true
    },
    tick_value: {
        type: Number,
        default: 0,
        index: true
    },
    status: {
        type: String,
        enum: ['open', 'closed', 'pending', 'canceled'],
    },
    side: {
        type: String,
        enum: ['buy', 'buy_limit', 'buy_stop', 'sell', 'sell_limit', 'sell_stop'],
    },

    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});

tradeMapSchema.index({ acc_src: 1, ticket_src: 1, acc_dist: 1 })
tradeMapSchema.index({ status: 1, acc_src: 1, acc_dist: 1 })
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
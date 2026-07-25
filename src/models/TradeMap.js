import mongoose from "mongoose"

const tradeMapSchema = new mongoose.Schema({
    server_src: {
        type: String
    },
    acc_src: {
        type: Number,
        index: true
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
    open_timestamp_src: {
        type: Number
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
    },
    close_timestamp_src: {
        type: Number,
    },
    magic_src: {
        type: Number
    },
    comment_src: {
        type: String
    },
    commission_src: {
        type: Number
    },
    swap_src: {
        type: Number
    },
    profit_src: {
        type: Number
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
    open_timestamp_dist: {
        type: Number,
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
    },
    close_timestamp_dist: {
        type: Number,
    },
    magic_dist: {
        type: Number,
    },
    comment_dist: {
        type: String
    },
    commission_dist: {
        type: Number
    },
    swap_dist: {
        type: Number
    },
    profit_dist: {
        type: Number
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
        enum: ['open', 'closed', 'pending', 'canceled', 'deleted'],
        index: true
    },
    side: {
        type: String,
        enum: ['buy', 'buy_limit', 'buy_stop', 'sell', 'sell_limit', 'sell_stop'],
        index: true
    },
    closing_type: {
        type: String,
        enum: ['single', 'partial', 'bulk', 'magic', 'all', 'none'],
        default: 'none'
    },
    partial_code: {
        type: Number,
        default: 0
    },
    platform: {
        type: String,
        enum: ['metatrader', 'panel'],
        default: 'metatrader',
    },
    created_at: {
        type: Number,
        default: Date.now
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
        console.error("❌ Error Syncing Symbol indexes:", err);
    }
}
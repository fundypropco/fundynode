import mongoose from "mongoose"

const tradeMapSchema = new mongoose.Schema({
    server_src: {
        type: String,
        default: ''
    },
    acc_src: {
        type: Number,
        index: true,
        default: 0
    },
    ticket_src: {
        type: Number,
        default: 0
    },
    symbol_src: {
        type: String,
        default: ''
    },
    vol_src: {
        type: Number,
        default: 0
    },
    open_price_src: {
        type: Number,
        default: 0
    },
    open_time_src: {
        type: String,
        default: ''
    },
    open_timestamp_src: {
        type: Number,
        default: 0
    },
    sl_src: {
        type: Number,
        default: 0
    },
    tp_src: {
        type: Number,
        default: 0
    },
    close_price_src: {
        type: Number,
        default: 0
    },
    close_time_src: {
        type: String,
        default: ''
    },
    close_timestamp_src: {
        type: Number,
        default: 0
    },
    magic_src: {
        type: Number,
        default: 0
    },
    comment_src: {
        type: String,
        default: ''
    },
    commission_src: {
        type: Number,
        default: 0
    },
    swap_src: {
        type: Number,
        default: 0
    },
    profit_src: {
        type: Number,
        default: 0
    },

    acc_dist: {
        type: Number,
        default: 0
    },
    ticket_dist: {
        type: Number,
        default: 0
    },
    server_dist: {
        type: String,
        default: ''
    },
    symbol_dist: {
        type: String,
        default: ''
    },
    vol_dist: {
        type: Number,
        default: 0
    },
    open_price_dist: {
        type: Number,
        default: 0
    },
    open_time_dist: {
        type: String,
        default: ''
    },
    open_timestamp_dist: {
        type: Number,
        default: 0
    },
    sl_dist: {
        type: Number,
        default: 0
    },
    tp_dist: {
        type: Number,
        default: 0
    },
    close_price_dist: {
        type: Number,
        default: 0
    },
    close_time_dist: {
        type: String,
        default: ''
    },
    close_timestamp_dist: {
        type: Number,
        index: true,
        default: 0
    },
    magic_dist: {
        type: Number,
        default: 0
    },
    comment_dist: {
        type: String
    },
    commission_dist: {
        type: Number,
        default: 0
    },
    commission_final: {
        type: Number,
        default: 0
    },
    swap_dist: {
        type: Number,
        default: 0
    },
    swap_final: {
        type: Number,
        default: 0
    },
    profit_dist: {
        type: Number,
        default: 0
    },
    profit_final: {
        type: Number,
        default: 0
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
    tick_size: {
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
        default: Date.now,
        index: true
    }
});


tradeMapSchema.index({ acc_src: 1, ticket_src: 1, acc_dist: 1, ticket_dist: 1 })
tradeMapSchema.index({ acc_src: 1, ticket_src: 1 })
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
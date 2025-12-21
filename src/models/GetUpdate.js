import mongoose from "mongoose"

const getUpdateSchema = new mongoose.Schema({

    handler: {
        type: Number,
        index: true,
    },
    message: {
        type: String
    },
    keyid: {
        type: Number,
        index: true
    },
    try_count: {
        type: Number,
        default: 0,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'error', 'internal_error', 'waiting'],
        index: true,
        default: 'pending'
    },
    side: {
        type: String,
        enum: ['buy', 'buy_limit', 'buy_stop', 'sell', 'sell_limit', 'sell_stop', 'none'],
        default: 'none'
    },
    description: {
        type: [String],
        default: []
    },

    server: {
        type: String,
        default: '',
        index: true,
    },
    acc: {
        type: Number,
        index: true,
    },
    ticket: {
        type: Number,
        index: true,
        default: 0
    },
    symbol: {
        type: String,
    },
    vol: {
        type: Number,
    },
    sl: {
        type: Number
    },
    tp: {
        type: Number
    },
    comment: {
        type: String
    },
    magic: {
        type: Number
    },

    origin_server: {
        type: String,
    },
    origin_acc: {
        type: Number,
        index: true,
        default: 0
    },
    origin_ticket: {
        type: Number,
        index: true,
        default: 0
    },
    origin_symbol: {
        type: String,
    },
    origin_vol: {
        type: Number,
    },
    origin_open_price: {
        type: Number
    },
    origin_open_time: {
        type: String,
    },
    origin_open_timestamp: {
        type: Number,
    },
    origin_close_price: {
        type: Number
    },
    origin_close_time: {
        type: String,
    },
    origin_close_timestamp: {
        type: Number,
    },
    origin_sl: {
        type: Number
    },
    origin_tp: {
        type: Number
    },
    origin_comment: {
        type: String
    },
    origin_magic: {
        type: Number
    },
    origin_commission: {
        type: Number
    },
    origin_swap: {
        type: Number
    },
    origin_profit: {
        type: Number
    },

    origin_new_ticket: {
        type: Number,
    },
    origin_new_vol: {
        type: Number,
    },
    origin_new_commission: {
        type: Number,
    },

    symbol_title: {
        type: String,
    },
    created_at: {
        type: Number,
        default: Date.now
    },
    updated_at: {
        type: Number,
        default: Date.now
    }
});

getUpdateSchema.index({ acc: 1, handler: 1 })
getUpdateSchema.index({ server: 1, handler: 1 })
getUpdateSchema.index({ origin_acc: 1, origin_ticket: 1 })

const GetUpdate = mongoose.model('GetUpdate', getUpdateSchema, 'get_updates')

export default GetUpdate

export async function createGetUpdateIndexes() {
    try {
        await GetUpdate.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
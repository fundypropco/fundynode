import mongoose from "mongoose"

const copierSchema = new mongoose.Schema({
    acc: {
        type: Number,
        index: true,
    },
    server: {
        type: String,
        index: true,
    },
    copy: {
        type: Boolean,
    },
    vol: {
        type: String,
        enum: ['calc', 'exact']
    },
    profit_bl: {
        type: Number
    },
    profit_eq: {
        type: Number
    },
    open_trades: {
        type: Number,
        index: true,
    }
}, { _id: false })

const accountSchema = new mongoose.Schema({
    acc: {
        type: Number,
        required: true,
        unique: true
    },
    server: {
        type: String,
        index: true
    },
    initial: {
        type: Number
    },
    drawdown: {
        type: Number
    },
    copy: {
        type: Boolean,
    },
    copiers: {
        type: [copierSchema],
        default: []
    },
    check_trade_map_time: {
        type: Number,
        default: 0,
    },
    created_at: {
        type: Number,
        default: Date.now,
    }
})

accountSchema.index({ acc: 1, "copiers.acc": 1 })
accountSchema.index({ copy: 1, check_trade_map_time: 1 })

const Account = mongoose.model('Account', accountSchema, 'accounts');

export default Account

export async function createAccountIndexes() {
    try {
        await Account.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
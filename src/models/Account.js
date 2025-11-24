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
        default: true,
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
        default: "",
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
        default: false
    },
    copiers: {
        type: [copierSchema],
        default: []
    },
    created_at: {
        type: Date,
        default: Date.now
    }
});


const Account = mongoose.model('Account', accountSchema, 'accounts');

export default Account

export async function createAccountIndexes() {
    try {
        await Account.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
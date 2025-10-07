const mongoose = require("mongoose");

const copierSchema = new mongoose.Schema({
    acc: String,
    server: String,
    initial: Number,
    vol: {
        type: String,
        enum: ['calc', 'exact']
    }
}, { _id: false })

const accountSchema = new mongoose.Schema({
    acc: {
        type: String,
        required: true,
        unique: true
    },
    initial: {
        // by admin
        type: Number
    },
    tddp: {
        // total drawdown percent
        // by admin
        type: Number
    },
    tddv: {
        // total drawdown value
        // by admin
        type: Number
    },
    eq: {
        // equity
        type: Number
    },
    eqh: {
        // equity_high
        type: Number
    },
    eqht: {
        // equity_high_time
        type: Date
    },
    eql: {
        // equity_low
        type: Number
    },
    eqlt: {
        // equity_low_time
        type: Date
    },
    bl: {
        // balance
        type: Number
    },
    blh: {
        // balance_high
        type: Number
    },
    blht: {
        // balance_high_time
        type: Date
    },
    bll: {
        // balance_low
        type: Number
    },
    bllt: {
        // balance_low_time
        type: Date
    },
    otc: {
        // open trade count
        type: Number
    },
    htc: {
        // history trade count
        type: Number
    },
    profit: {
        type: Number
    },
    timestamp: {
        // تایم استمپ بروکر در لحظه کپچر کردن دیتای حساب
        type: String
    },
    copiers: {
        type: [copierSchema],
        default: []
    },
    server: {
        type: String,
        default: ""
    },
    copy: {
        type: Boolean,
        default: false
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        // تایم استمپ لحظه رسیدن دیتا و بروزرسانی در نود
        type: Date,
        default: Date.now
    }
});

const Account = mongoose.model('Account', accountSchema, 'accounts');

exports.Account = Account

exports.syncAccountIndexes = async function () {
    try {
        await Account.syncIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
    acc: {
        type: String,
        required: true,
        unique: true
    },
    initial: {
        type: Number
    },
    eq: {
        type: Number
    },
    eqh: {
        type: Number
    },
    eqht: {
        type: Number
    },
    eql: {
        type: Number
    },
    eqlt: {
        type: Number
    },
    bl: {
        type: Number
    },
    blh: {
        type: Number
    },
    blht: {
        type: Number
    },
    bll: {
        type: Number
    },
    bllt: {
        type: Number
    },
    trade_count: {
        type: Number
    },
    history_count: {
        type: Number
    },
    time: {
        type: Number
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


const Account = mongoose.model('Account', accountSchema);

exports.Account = Account
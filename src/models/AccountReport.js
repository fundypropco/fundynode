const mongoose = require("mongoose");

const accountReportSchema = new mongoose.Schema({
    date: {
        type: String,
        required: true
    },
    acc: {
        type: String,
        required: true,
    },
    eqi: {
        // day initial equity
        type: Number
    },
    eqit: {
        // day initial equity time
        type: String
    },
    eqh: {
        // equity_high
        type: Number
    },
    eqht: {
        // equity_high_time
        type: String
    },
    eql: {
        // equity_low
        type: Number
    },
    eqlt: {
        // equity_low_time
        type: String
    },
    bli: {
        // day initial balance
        type: Number
    },
    blit: {
        // day initial balance time
        type: String
    },
    blh: {
        // balance_high
        type: Number
    },
    blht: {
        // balance_high_time
        type: String
    },
    bll: {
        // balance_low
        type: Number
    },
    bllt: {
        // balance_low_time
        type: String
    }
});

accountReportSchema.index({ acc: 1, date: 1 });

const AccountReport = mongoose.model('AccountReport', accountReportSchema, 'account_reports');

exports.AccountReport = AccountReport
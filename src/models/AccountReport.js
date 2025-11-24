import mongoose from "mongoose"

const accountReportSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    acc_src: {
        type: Number,
        required: true,
    },
    acc_dist: {
        type: Number,
        required: true,
    },
    eqi: {
        // day initial equity
        type: Number
    },
    eqit: {
        // day initial equity time
        type: Date
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
    bli: {
        // day initial balance
        type: Number
    },
    blit: {
        // day initial balance time
        type: Date
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
    }
})

accountReportSchema.index({ acc_src: 1, acc_dist: 1, date: 1 })

const AccountReport = mongoose.model('AccountReport', accountReportSchema, 'account_reports')

export default AccountReport

export async function createAccountReportIndexes() {
    try {
        await AccountReport.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
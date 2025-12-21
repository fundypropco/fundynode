import mongoose from "mongoose"

const accountReportSchema = new mongoose.Schema({
    date: {
        type: String,
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

    balance: {
        type: Number
    },
    equity: {
        type: Number
    },
    open_trades: {
        type: Number
    },

    eq_initial: {
        type: Number
    },
    eq_initial_time: {
        type: String
    },
    eq_initial_timestamp: {
        type: Number
    },

    eq_high: {
        type: Number
    },
    eq_high_time: {
        type: String
    },
    eq_high_timestamp: {
        type: Number
    },

    total_eq_high: {
        type: Number
    },
    total_eq_high_time: {
        type: String
    },
    total_eq_high_timestamp: {
        type: Number
    },

    eq_low: {
        type: Number
    },
    eq_low_time: {
        type: String
    },
    eq_low_timestamp: {
        type: Number
    },

    total_eq_low: {
        type: Number
    },
    total_eq_low_time: {
        type: String
    },
    total_eq_low_timestamp: {
        type: Number
    },

    bl_initial: {
        type: Number
    },
    bl_initial_time: {
        type: String
    },
    bl_initial_timestamp: {
        type: Number
    },

    bl_high: {
        type: Number
    },
    bl_high_time: {
        type: String
    },
    bl_high_timestamp: {
        type: Number
    },

    total_bl_high: {
        type: Number
    },
    total_bl_high_time: {
        type: String
    },
    total_bl_high_timestamp: {
        type: Number
    },

    bl_low: {
        type: Number
    },
    bl_low_time: {
        type: String
    },
    bl_low_timestamp: {
        type: Number
    },

    total_bl_low: {
        type: Number
    },
    total_bl_low_time: {
        type: String
    },
    total_bl_low_timestamp: {
        type: Number
    },

    updated_time: {
        type: String,
    },

    updated_timestamp: {
        type: Number
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
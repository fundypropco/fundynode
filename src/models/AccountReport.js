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

    eq_initial: {
        type: Number
    },
    eq_initial_time: {
        type: Date
    },

    eq_high: {
        type: Number
    },
    eq_high_time: {
        type: Date
    },

    total_eq_high: {
        type: Number
    },
    total_eq_high_time: {
        type: Date
    },

    eq_low: {
        type: Number
    },
    eq_low_time: {
        type: Date
    },

    total_eq_low: {
        type: Number
    },
    total_eq_low_time: {
        type: Date
    },

    bl_initial: {
        type: Number
    },
    bl_initial_time: {
        type: Date
    },

    bl_high: {
        type: Number
    },
    bl_high_time: {
        type: Date
    },

    total_bl_high: {
        type: Number
    },
    total_bl_high_time: {
        type: Date
    },

    bl_low: {
        type: Number
    },
    bl_low_time: {
        type: Date
    },

    total_bl_low: {
        type: Number
    },
    total_bl_low_time: {
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
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
    vol_factor: {
        type: Number,
        default: 1
    }
}, { _id: false })

const accountSchema = new mongoose.Schema({
    username: {
        type: String,
        default: ''
    },
    // در حالت پراپ بدون متاتریدر دمو، مقدار این فیلد برابر صفر خواهد بود
    acc_meta: {
        type: Number,
        index: true,
        default: 0
    },
    acc: {
        /* اگر حساب پراپ باشه این کد برابر کد حساب معاملاتی کاربر در پراپ است */
        /* در کپی ترید ساده که فقط 2 متاتریدر در کار است نیز این فیلد مقدار میگیرد و مقدار آن برابر شناسه متاتریدر است */
        type: Number,
        index: true,
        default: 0
    },
    server: {
        type: String,
        index: true,
        default: ''
    },
    initial: {
        type: Number
    },
    drawdown: {
        /* مینیمم عدد مجاز ایکوئیتی حساب به دلار مثال 950 دلار */
        type: Number,
        default: 0
    },
    commission_rate: {
        type: Number,
        default: 0
    },
    swap_rate: {
        type: Number,
        default: 0
    },
    copy: {
        type: Boolean,
        default: false
    },
    copiers: {
        type: [copierSchema],
        default: []
    },
    status: {
        type: String,
        enum: ['trading', 'passed', 'failed', 'stopped'],
        index: true,
        default: 'stopped'
    },
    check_time: {
        type: Number,
        default: 0,
    },
    created_at: {
        type: Number,
        default: Date.now,
    }
})

accountSchema.index({ acc: 1, "copiers.acc": 1 })
accountSchema.index({ copy: 1, check_time: 1 })

const Account = mongoose.model('Account', accountSchema, 'accounts');

export default Account

export async function createAccountIndexes() {
    try {
        await Account.createIndexes();
    } catch (err) {
        console.error("❌ Error Syncing Symbol indexes:", err);
    }
}
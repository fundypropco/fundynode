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
    // #. کلید بروکر حساب Master (2026-11-11 ؛ از پنل در set-acc) ؛ نمادها ، کلید معامله و diff_time با همین کلید
    broker_key: {
        type: String,
        index: true,
        default: ''
    },
    copy: {
        type: Boolean,
    },
    vol_factor: {
        type: Number,
        default: 1
    },
    // #.
    // حساب مقصد سنتی است؟ (۱ لات سنتی = ۰.۰۱ لات استاندارد) ⇒ حجم کپی ضربدر ۱۰۰ می‌شود
    // تا اندازه اقتصادی معامله روی حساب Master با معامله کاربر یکی باشد.
    // قاعده کسب‌وکار (2026-10-11): Master پلن‌های اقتصادی سنتی و Master پلن‌های حرفه‌ای استاندارد است،
    // ولی مبنای تصمیم همین فیلد است نه نوع پلن یا vol_factor (قبلا از vol_factor < 1 حدس زده می‌شد).
    cent: {
        type: Boolean,
        default: false
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
    // #. کلید بروکر حساب User MT (2026-11-11 ؛ از پنل در set-acc ؛ بدون User MT خالی)
    broker_key: {
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
    // #.
    // قاعده ترید در خبر از کانفیگ حساب در پنل (set-acc و set-acc-news؛ helpers/newsRule.js)
    // news_trading = false ⇒ باز کردن معامله از متاتریدر کاربر در بازه خبر بسته است ؛ پیش‌فرض true (حساب‌های قدیمی بدون محدودیت)
    news_trading: {
        type: Boolean,
        default: true
    },
    // فاصله مجاز ترید قبل از شروع و بعد از پایان خبر (دقیقه)
    news_gap_minutes: {
        type: Number,
        default: 0
    },
    // درجه‌های اهمیت خبرهایی که فاصله دارند: high ، medium ، low ، holiday
    news_impacts: {
        type: [String],
        default: []
    },
    copiers: {
        type: [copierSchema],
        default: []
    },
    status: {
        type: String,
        enum: ['trading', 'passed', 'failed', 'stopped', 'withdrawn'],
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

// #.
// تازه‌ترین رکورد یک حساب؛ شماره حساب باید یکتا باشد ولی ساخت حساب از پنل (set-acc) رکورد قبلی همان
// شماره حساب را فقط stopped می‌کند و پاک نمی‌کند ⇒ هر جست‌وجو باید رکورد فعال (تازه‌ترین) را بردارد
accountSchema.statics.findLast = function (filter) {
    return this.findOne(filter).sort({ created_at: -1, _id: -1 })
}

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
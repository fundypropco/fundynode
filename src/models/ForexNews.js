import mongoose from "mongoose"

// #.
// اخبار اقتصادی ساعت‌دار ۷ روز جاری که پنل (FundyPanel ، صفحه اخبار اقتصادی ادمین ، دکمه «ارسال به FundyNode») می‌فرستد
// هر ارسال کل مجموعه را جایگزین می‌کند (POST /api/tradingroom/set-news) ؛ فقط برای قاعده ترید در خبر (helpers/newsRule.js)
const forexNewsSchema = new mongoose.Schema({
    // شناسه خبر در پنل (forex_news.id)
    news_id: {
        type: Number,
        default: 0
    },
    // نماد ارز خبر: USD ، EUR ، ... ؛ ALL = همه نمادها
    currency: {
        type: String,
        default: ''
    },
    title: {
        type: String,
        default: ''
    },
    // high ، medium ، low ، holiday
    impact: {
        type: String,
        index: true,
        default: ''
    },
    // زمان شروع خبر (یونیکس میلی‌ثانیه UTC)
    start: {
        type: Number,
        index: true,
        default: 0
    },
    // طول خبر به دقیقه (سخنرانی ، نشست) ؛ 0 = لحظه‌ای
    duration: {
        type: Number,
        default: 0
    },
    // نمادهای اضافه همین ارز از تنظیمات تریدینگ روم پنل (مثلا USD ⇒ US30 ، NAS100) ؛ علاوه بر نمادهایی که کد ارز در نامشان است
    symbols: {
        type: [String],
        default: []
    },
    created_at: {
        type: Number,
        default: Date.now,
    }
})

const ForexNews = mongoose.model('ForexNews', forexNewsSchema, 'forex_news');

export default ForexNews

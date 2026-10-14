import ForexNews from '../models/ForexNews.js'

// #.
// قاعده ترید در خبر (همان NewsRuleService پنل؛ 2026-10-14):
// حساب بدون ترید خبری (account.news_trading === false) نمی‌تواند از news_gap_minutes دقیقه قبل از شروع تا news_gap_minutes دقیقه
// بعد از پایان خبرهای ساعت‌دار با درجه اهمیت داخل account.news_impacts روی نمادهای همان ارز معامله باز کند.
// نماد مشمول: نامش کد ارز را دارد (USD ⇒ EURUSD ، XAUUSD) یا در news.symbols (نمادهای اضافه همان ارز) است ؛ ارز ALL ⇒ همه
// پنل خودش سفارش‌های FP Trader را چک می‌کند ⇒ این چک فقط برای سفارش‌هایی است که کاربر از متاتریدر خودش (acc_meta) باز می‌کند
// #. مبنای زمان همیشه UTC: news.start یونیکس میلی‌ثانیه (UTC) و زمان معامله Date.now() سرور ؛ نه ساعت بروکر متاتریدر
//    (open_timestamp پیام، معمولا UTC+2/+3) و نه TZ پروسه — درخواست صاحب پروژه 2026-10-14

// #. بیشترین طول خبر که پنل می‌پذیرد (دقیقه)
const MAX_DURATION = 600

export function newsAffects(news, symbolTitle) {
    const currency = String(news.currency || '').toUpperCase()
    const symbol = String(symbolTitle || '').toUpperCase()
    if (!symbol) return false
    if (currency === 'ALL') return true
    if (currency.length >= 3 && symbol.includes(currency)) return true
    return (news.symbols || []).map(s => String(s).toUpperCase()).includes(symbol)
}

// #. بازه ممنوع خبر برای یک فاصله: [from , to) به میلی‌ثانیه
export function newsWindow(news, gapMinutes) {
    const gap = (Number(gapMinutes) || 0) * 60000
    return {
        from: Number(news.start) - gap,
        to: Number(news.start) + (Number(news.duration) || 0) * 60000 + gap
    }
}

// #.
// خبری که الان باز کردن معامله روی این نماد را برای این حساب می‌بندد ؛ نبود ⇒ null
// خروجی: { news , from , to } (اگر چند خبر هم‌پوشان باشند آن که دیرتر تمام می‌شود)
export async function findNewsBlock(account, symbolTitle, now = Date.now()) {
    if (!account || account.news_trading !== false) return null
    const impacts = Array.isArray(account.news_impacts) ? account.news_impacts : []
    if (!impacts.length) return null
    const gap = Number(account.news_gap_minutes) || 0

    const candidates = await ForexNews.find({
        impact: { $in: impacts },
        start: { $lte: now + gap * 60000, $gte: now - (gap + MAX_DURATION) * 60000 }
    }).sort({ start: 1 }).lean()

    let found = null
    for (const news of candidates) {
        if (!newsAffects(news, symbolTitle)) continue
        const w = newsWindow(news, gap)
        if (now >= w.from && now < w.to && (!found || w.to > found.to)) {
            found = { news, from: w.from, to: w.to }
        }
    }
    return found
}

// #. متن توضیح بستن معامله مبدا (description دستور / لاگ)
export function newsBlockDescription(block, symbolTitle) {
    const until = new Date(block.to).toISOString().slice(11, 16)
    return `news trading is not allowed on this account / ${block.news.impact} ${block.news.currency} news "${block.news.title}" / ${symbolTitle} paused until ${until} UTC`
}

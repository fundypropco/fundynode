// #.
// محاسبات بستن بخشی (partial close) — بدون وابستگی به مدل/دیتابیس تا هم در handler ها و هم در تست استفاده شود
//
// اصطلاحات:
//   حجم کاربر (src)   = لات حساب کاربر (متاتریدر کاربر یا FP Trader)
//   حجم Master (dist) = عدد خام EA حساب Master (سنتی ⇒ ×۱۰۰ ، اقتصادی ⇒ × vol_factor)
// همه مبالغ (کمیسیون، سواپ، سود) عدد خام EA هستند؛ تبدیل به مقیاس کاربر فقط در copierAmounts.toPanelTrade

import { round } from './copierAmounts.js'

// #.
// تعداد رقم اعشار گام حجم (0.01 ⇒ 2)
function stepDigits(step) {
    const s = String(step)
    if (s.includes('e-')) return Number(s.split('e-')[1])
    return s.includes('.') ? s.split('.')[1].length : 0
}

// #.
// گرد کردن به پایین تا گام حجم بروکر Master
export function floorToStep(vol, step) {
    const s = Number(step) > 0 ? Number(step) : 0.01
    const digits = stepDigits(s)
    return round(Math.floor(Number(vol) / s + 1e-9) * s, digits)
}

// #.
// حجم بستن روی Master متناسب با حجمی که واقعا روی Master باز شده است
// (نه تبدیل دوباره حجم کاربر با getOrderVol: حجم باز شده خودش گرد شده و ممکن است با ضریب دقیق نخواند)
//
// ورودی:
//   masterOpenVol  حجم باز روی Master (TradeMap.vol_dist)
//   closedVol      حجم بسته‌شده کاربر
//   openVol        حجم باقیمانده کاربر (closedVol + openVol = حجم کاربر قبل از بستن)
//   symbol         نماد Master (vol_step ، vol_min) ؛ نبود ⇒ گام 0.01
// خروجی: { action, vol, remain }
//   action = 'partial' ⇒ دستور PARTIAL_CLOSE با vol
//          = 'close'   ⇒ باقیمانده روی Master کمتر از حداقل حجم می‌شد ⇒ (فقط متاتریدر کاربر) کل Master بسته شود
//          = 'skip'    ⇒ بخش بسته‌شده روی Master کمتر از حداقل حجم است ⇒ (فقط متاتریدر کاربر) کاری روی Master انجام نشود
//   برای پنل هر خروجی غیر از partial یعنی «این حجم قابل بستن بخشی نیست» (تصمیم صاحب پروژه 2026-10-17)
export function masterPartialVol(masterOpenVol, closedVol, openVol, symbol) {
    const open = Number(masterOpenVol) || 0
    const closed = Number(closedVol) || 0
    const rest = Number(openVol) || 0
    const step = Number(symbol?.vol_step) > 0 ? Number(symbol.vol_step) : 0.01
    const min = Number(symbol?.vol_min) > 0 ? Number(symbol.vol_min) : step

    const userTotal = closed + rest
    const ratio = userTotal > 0 ? closed / userTotal : 0
    const vol = floorToStep(open * ratio, step)
    const remain = round(open - vol, stepDigits(step))

    if (vol < min - 1e-9) {
        return { action: 'skip', vol, remain: open }
    }
    if (remain < min - 1e-9) {
        return { action: 'close', vol: open, remain: 0 }
    }
    return { action: 'partial', vol, remain }
}

// #.
// تقسیم کمیسیون بین بخش بسته‌شده و باقیمانده (برای commission_dist و همین‌طور commission_charged)
//
//   MT5 (تیکت Master عوض نمی‌شود): کمیسیون گزارش‌شده مجموع تجمیعی کل پوزیشن است (ورود + خروج‌های تا الان)
//     ⇒ مجموع خانواده (همه رکوردهای همان تیکت Master) باید برابر گزارش شود (اگر منفی‌تر است) ؛
//        سهم باقیمانده متناسب با حجم از کمیسیون رکورد باز و بقیه (با اختلاف) روی بخش بسته‌شده
//   MT4 (تیکت تازه برای باقیمانده): کمیسیون گزارش‌شده فقط مال تیکت بسته‌شده است و بقیه کمیسیون اولیه
//     به تیکت تازه می‌رسد ⇒ بخش بسته = گزارش ، باقیمانده = کمیسیون رکورد باز − گزارش
//     (اگر کمیسیون در بستن گرفته شده و رکورد باز کمیسیونی نداشته ⇒ باقیمانده 0)
//   reported = null (EA قدیمی بدون این فیلد) ⇒ تقسیم متناسب با حجم
//
// ورودی:
//   openValue    کمیسیون رکورد باز قبل از بستن بخشی
//   familySum    مجموع کمیسیون همه رکوردهای همان تیکت Master (شامل رکورد باز)
//   reported     کمیسیون گزارش‌شده EA یا null
//   ratio        حجم بسته / حجم کل (سمت Master)
//   sameTicket   true ⇒ MT5
// خروجی: { closed, remain } ⇒ کمیسیون نهایی بخش بسته‌شده و رکورد باقیمانده
// قاعده: مجموع خانواده بعد از تقسیم = familySum + (اختلاف تجمیعی MT5) یا familySum − openValue + reported + remain (MT4)
export function splitCommission(openValue, familySum, reported, ratio, sameTicket) {
    const open = Number(openValue) || 0
    const r = Math.min(Math.max(Number(ratio) || 0, 0), 1)

    if (reported === null || reported === undefined || !Number.isFinite(Number(reported))) {
        const remain = round(open * (1 - r), 2)
        return { closed: round(open - remain, 2), remain }
    }

    const rep = Number(reported)

    if (sameTicket) {
        // کمیسیون منفی‌تر = بیشتر ؛ فقط افزایش لحاظ می‌شود (همان قاعده HandleResClose)
        const sum = Number(familySum) || 0
        const diff = rep < sum ? round(rep - sum, 2) : 0
        const remain = round(open * (1 - r), 2)
        return { closed: round(open - remain + diff, 2), remain }
    }

    // MT4
    let remain = 0
    if (open < 0 && rep >= open) {
        remain = round(open - rep, 2)
    } else if (open > 0 && rep <= open) {
        remain = round(open - rep, 2)
    }
    return { closed: round(rep, 2), remain }
}

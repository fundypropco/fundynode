// #.
// تبدیل مقادیر مالی حساب Master (copier) به دلار و لات استاندارد و به مقیاس کاربر
//
// حجم کپی روی Master = vol_factor × حجم کاربر × (سنتی ? 100 : 1) ⇒ هر عدد مالی که EA حساب Master
// گزارش می‌کند (سود، سواپ، کمیسیون، بالانس، ایکوئیتی) به واحد حساب Master (سنت در حساب سنتی) و به
// اندازه vol_factor برابر معامله کاربر است.
//
// قاعده نام‌ها (2026-11-03 ، یک پسوند در نود و پنل یک معنی دارد ؛ فرق فقط واحد است: Mongo خام EA ، پنل دلار و لات):
//   _src      حساب کاربر (User MT / FP Trader) ، همان عددی که کاربر دیده
//   _dist     حساب Master ، عدد واقعی بروکر
//   _charged  کمیسیون و سواپ Master با نرخ شرکت (commission_rate / swap_rate = درصد اضافه روی عدد بروکر ، EA حساب می‌کند)
//   _final    فقط در داده پنل: به اندازه معامله کاربر = (profit_dist | _charged) / vol_factor
//
// دو قدم تبدیل هنگام ارسال به پنل:
//   ۱. واحد:   Z = خام / units               (units = 100 برای حساب سنتی، وگرنه 1) ⇒ دلار و لات استاندارد ، ۴ رقم اعشار
//              (سنت با دو رقم اعشار ⇐ دلار با چهار رقم ، بدون گرد کردن واقعی)
//   ۲. مقیاس:  Z_final = Z / vol_factor       ⇒ گرد به پائین تا ۴ رقم (سود تریدر کمتر ، ضرر تریدر بیشتر)
// حساب حرفه‌ای استاندارد (vol_factor = 1 ، units = 1) ⇒ همه مقادیر بدون تغییر.
//
// ⚠️ مقادیر خام EA در Mongo (TradeMap و گزارش 42 در ردیس) دست نمی‌خورند چون منطق داخلی نود
// (کمیسیون تجمیعی پارشیال‌ها، حجم دستورهای خروجی، isOrderPossible) با همان عددهای EA کار می‌کند؛
// تبدیل فقط هنگام ارسال به FundyPanel انجام می‌شود.
// این فایل عمدا هیچ وابستگی (مدل/دیتابیس) ندارد تا هم در مدل‌ها و هم در worker استفاده شود.

export const PANEL_DIGITS = 4

export function round(n, digits = 2) {
    const value = Number(n)
    if (!Number.isFinite(value)) return 0
    const f = 10 ** digits
    // گرد کردن متقارن (۰.۰۰۵- ⇒ ۰.۰۱-) و بدون صفر منفی
    return (Math.sign(value) * Math.round(Math.abs(value) * f + 1e-9) / f) || 0
}

// #.
// گرد کردن به پائین (به سمت منفی بی‌نهایت) برای مقادیری که به تریدر تعلق می‌گیرد:
// سود کمتر و ضرر / کمیسیون / سواپ بیشتر ⇒ گرد کردن در دراز مدت هزینه‌ای برای شرکت ندارد
// خطای اعشار ممیز شناور اول در ۶ رقم بعد از دقت حذف می‌شود (‎-6.5 نباید ‎-6.5001 شود)
export function floorTo(n, digits = PANEL_DIGITS) {
    const value = Number(n)
    if (!Number.isFinite(value)) return 0
    const f = 10 ** digits
    const scaled = Math.round(value * f * 1e6) / 1e6
    return (Math.floor(scaled) / f) || 0
}

// #.
// ضریب واحد حساب: سنتی ⇒ 100
export function copierUnits(cent) {
    return cent ? 100 : 1
}

// #.
// ضریب حجم معتبر؛ مقدار خالی/صفر/نامعتبر ⇒ 1 (رفتار حساب استاندارد)
export function validVolFactor(volFactor) {
    const n = Number(volFactor)
    return Number.isFinite(n) && n > 0 ? n : 1
}

// #.
// copier مربوط به یک حساب Master ؛ اگر پیدا نشد اولین copier فعال و در نهایت اولین copier
// (فعلا هر حساب فقط یک copier دارد)
export function findCopier(account, copierAcc = null) {
    const copiers = account?.copiers ?? []
    return (copierAcc != null && copiers.find(c => Number(c.acc) === Number(copierAcc)))
        || copiers.find(c => c.copy)
        || copiers[0]
        || null
}

// #.
// ضریب‌های ذخیره‌شده روی TradeMap از روی copier
export function copierFactors(copier) {
    return {
        vol_factor: validVolFactor(copier?.vol_factor),
        cent: !!copier?.cent,
    }
}

// #.
// ضریب‌ها و نرخ‌های لحظه ساخت معامله (2026-11-03): copier + نرخ کمیسیون / سواپ حساب
// نرخ بعدا با فرم ادمین عوض می‌شود ⇒ هر معامله نرخ خودش را نگه می‌دارد (حسابداری درآمد کمیسیون / سواپ)
export function tradeFactors(account, copierAcc = null) {
    const rate = value => (value == null || !Number.isFinite(Number(value)) ? null : Number(value))
    return {
        ...copierFactors(findCopier(account, copierAcc)),
        commission_rate: rate(account?.commission_rate),
        swap_rate: rate(account?.swap_rate),
    }
}

// #.
// ردیف TradeMap آماده ارسال به FundyPanel (plan_trades)
// _src ⇐ همان عدد حساب کاربر ، _dist و _charged ⇐ دلار / لات استاندارد روی Master ، _final ⇐ دلار به اندازه معامله کاربر
// TradeMap قدیمی بدون vol_factor/cent ⇒ ضریب 1 و غیرسنتی ⇒ همان مقادیر قبلی
export function toPanelTrade(tradeMap) {
    const units = copierUnits(tradeMap.cent)
    const volFactor = validVolFactor(tradeMap.vol_factor)
    const master = value => round(Number(value || 0) / units, PANEL_DIGITS)

    const profitDist = master(tradeMap.profit_dist)
    const commissionCharged = master(tradeMap.commission_charged)
    const swapCharged = master(tradeMap.swap_charged)

    return {
        ...tradeMap,
        // #.
        // شناسه ثابت ردیف (2026-10-17) ؛ پنل plan_trades را با آن یکتا می‌کند چون partial_code و تیکت‌ها
        // در بستن بخشی عوض / تکرار می‌شوند (کلید قبلی پنل در MT5 بخش بسته و باقیمانده را روی هم می‌نوشت)
        map_id: tradeMap._id ? String(tradeMap._id) : null,
        vol_factor: tradeMap.vol_factor ?? null,
        cent: tradeMap.cent ?? null,
        commission_rate: tradeMap.commission_rate ?? null,
        swap_rate: tradeMap.swap_rate ?? null,
        vol_dist: master(tradeMap.vol_dist),
        profit_dist: profitDist,
        swap_dist: master(tradeMap.swap_dist),
        commission_dist: master(tradeMap.commission_dist),
        commission_charged: commissionCharged,
        swap_charged: swapCharged,
        profit_final: floorTo(profitDist / volFactor),
        swap_final: floorTo(swapCharged / volFactor),
        commission_final: floorTo(commissionCharged / volFactor),
    }
}

// #.
// مبلغ دلاری حساب کاربر (initial ، drawdown ، ...) به واحد حساب Master
// برای پیام 302 (پروفایل EA) و مقایسه با ایکوئیتی خام در isOrderPossible
export function toMasterUnits(amount, cent) {
    return round(Number(amount || 0) * copierUnits(cent), 2)
}

// #.
// بالانس / ایکوئیتی گزارش‌شده Master ⇐ مقدار نمایشی کاربر
//   initial + (مقدار خام − initial × units) / (units × vol_factor)
// مثال: initial 1000 ، Master سنتی ، vol_factor 0.5 ، ایکوئیتی خام 99000 سنت (۱۰ دلار ضرر روی Master)
//   ⇒ 1000 + (99000 − 100000) / 50 = 980 (۲۰ دلار ضرر به اندازه معامله کاربر)
// گرد به پائین تا سنت (به سود شرکت ، مثل _final) ؛ بدون initial معتبر فقط واحد تبدیل می‌شود
export function toUserBalance(rawValue, initial, copier) {
    if (rawValue == null || !Number.isFinite(Number(rawValue))) return null
    const units = copierUnits(copier?.cent)
    const volFactor = validVolFactor(copier?.vol_factor)
    const base = Number(initial)
    if (!(base > 0)) {
        return floorTo(Number(rawValue) / units, 2)
    }
    return floorTo(base + (Number(rawValue) / units - base) / volFactor, 2)
}

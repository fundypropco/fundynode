// #.
// تبدیل مقادیر مالی حساب Master (copier) به مقیاس کاربر
//
// حجم کپی روی Master = vol_factor × حجم کاربر × (سنتی ? 100 : 1) ⇒ هر عدد مالی که EA حساب Master
// گزارش می‌کند (سود، سواپ، کمیسیون، بالانس، ایکوئیتی) به واحد حساب Master (سنت در حساب سنتی) و به
// اندازه vol_factor برابر معامله کاربر است. دو قدم تبدیل:
//   ۱. واحد:   Z_user  = Z_master / units          (units = 100 برای حساب سنتی، وگرنه 1) ⇒ دلار واقعی روی Master
//   ۲. مقیاس:  Z_final = Z_user × (1 / vol_factor)                                     ⇒ دلار به اندازه معامله کاربر
// حساب حرفه‌ای (استاندارد، vol_factor = 1) ⇒ همه مقادیر بدون تغییر.
//
// ⚠️ مقادیر خام EA در Mongo (TradeMap و گزارش 42 در ردیس) دست نمی‌خورند چون منطق داخلی نود
// (کمیسیون تجمیعی پارشیال‌ها، حجم دستورهای خروجی، isOrderPossible) با همان عددهای EA کار می‌کند؛
// تبدیل فقط هنگام ارسال به FundyPanel انجام می‌شود.
// این فایل عمدا هیچ وابستگی (مدل/دیتابیس) ندارد تا هم در مدل TradeMap و هم در worker استفاده شود.

export function round(n, digits = 2) {
    const value = Number(n)
    if (!Number.isFinite(value)) return 0
    const f = 10 ** digits
    // گرد کردن متقارن (۰.۰۰۵- ⇒ ۰.۰۱-) و بدون صفر منفی
    return (Math.sign(value) * Math.round(Math.abs(value) * f + 1e-9) / f) || 0
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
// مقادیر مالی دلاری روی Master (پسوند user) از روی مقادیر خام EA در TradeMap
// profit_user ⇐ profit_dist ، swap_user ⇐ swap_final ، commission_user ⇐ commission_final
export function userAmounts(tradeMap) {
    const units = copierUnits(tradeMap.cent)
    return {
        profit_user: round(Number(tradeMap.profit_dist || 0) / units, 2),
        swap_user: round(Number(tradeMap.swap_final || 0) / units, 2),
        commission_user: round(Number(tradeMap.commission_final || 0) / units, 2),
    }
}

// #.
// ردیف TradeMap آماده ارسال به FundyPanel (plan_trades)
// _dist ها ⇐ دلار/لات استاندارد ، *_user ⇐ دلار روی Master ، *_final ⇐ دلار به اندازه معامله کاربر
// TradeMap قدیمی بدون vol_factor/cent ⇒ ضریب 1 و غیرسنتی ⇒ همان مقادیر قبلی
export function toPanelTrade(tradeMap) {
    const units = copierUnits(tradeMap.cent)
    const volFactor = validVolFactor(tradeMap.vol_factor)
    const user = userAmounts(tradeMap)

    return {
        ...tradeMap,
        vol_factor: tradeMap.vol_factor ?? null,
        vol_dist: round(Number(tradeMap.vol_dist || 0) / units, 4),
        profit_dist: round(Number(tradeMap.profit_dist || 0) / units, 2),
        swap_dist: round(Number(tradeMap.swap_dist || 0) / units, 2),
        commission_dist: round(Number(tradeMap.commission_dist || 0) / units, 2),
        ...user,
        profit_final: round(user.profit_user / volFactor, 2),
        swap_final: round(user.swap_user / volFactor, 2),
        commission_final: round(user.commission_user / volFactor, 2),
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
// بدون initial معتبر فقط واحد تبدیل می‌شود
export function toUserBalance(rawValue, initial, copier) {
    if (rawValue == null || !Number.isFinite(Number(rawValue))) return null
    const units = copierUnits(copier?.cent)
    const volFactor = validVolFactor(copier?.vol_factor)
    const base = Number(initial)
    if (!(base > 0)) {
        return round(Number(rawValue) / units, 2)
    }
    return round(base + (Number(rawValue) / units - base) / volFactor, 2)
}

import { toMasterUnits } from './copierAmounts.js'

// #.
// هزینه و مارجین یک سفارش روی حساب Master (2026-11-09 ، از isOrderPossible جدا شد تا max-vol پنل با همان فرمول حساب شود)
// سخت گیرانه تر از حساب واقعی: کمیسیون با بیشترین نرخ ، دو برابر اسپرد میانگین و مارجین لازم ؛ vol = حجم روی Master
export function orderCost(symbol, vol) {
    const lots = symbol.vol_min > 0 ? vol / symbol.vol_min : vol
    const commission = Math.abs((symbol.commission_max || 0) * lots)
    const spread_value = symbol.point > 0 ? Math.abs(vol * (symbol.tick_value || 0) * ((symbol.spread_avg_5 || 0) / symbol.point)) : 0
    const margin = Math.abs((symbol.margin || 0) * lots)
    return { commission, spread_value, margin, cost: commission + (2 * spread_value) }
}

// #.
// پول آزاد برای سفارش تازه روی Master: کمترین ( ایکوئیتی منهای حد دراودان ، فری مارجین ) ؛ همان دو شرط isOrderPossible
export function orderRoom(account, copier, report) {
    const freeEq = report.equity - toMasterUnits(account.drawdown, copier.cent)
    return Math.min(freeEq, report.free_margin)
}

// #.
// بیشترین حجم کاربر (لات حساب کاربر) که الان روی این نماد باز می شود (پیام «پول کافی نیست» FP Trader ، 2026-11-09)
// شرط isOrderPossible اکید است (cost + margin < room) ؛ هزینه با حجم خطی است ⇒ حجم Master = room / هزینه یک لات ، گرد به پائین 0.01
// حجم کاربر = حجم Master ÷ (ضریب حجم × ۱۰۰ در حساب سنتی) گرد به پائین تا getOrderVol از حجم Master بیشتر نشود ؛ سقف vol_max نماد Master
export function maxUserVol(account, copier, symbol, report) {
    const room = orderRoom(account, copier, report)
    const one = orderCost(symbol, 1)
    const perVol = one.cost + one.margin
    if (!(perVol > 0)) return null
    if (room <= 0) return { user_vol: 0, master_vol: 0, room }

    let masterVol = Math.floor((room / perVol) * 100) / 100
    if (masterVol > 0 && (masterVol * perVol) >= room) masterVol = Math.round((masterVol - 0.01) * 100) / 100
    if (symbol.vol_max > 0) masterVol = Math.min(masterVol, symbol.vol_max)
    masterVol = Math.max(0, masterVol)

    const factor = (Number(copier.vol_factor) || 1) * (copier.cent ? 100 : 1)
    const userVol = Math.max(0, Math.floor((masterVol / factor) * 100 + 1e-9) / 100)
    return { user_vol: userVol, master_vol: masterVol, room }
}

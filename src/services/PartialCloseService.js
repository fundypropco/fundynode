import TradeMap from '../models/TradeMap.js'
import Symbol from '../models/Symbol.js'
import GetUpdateService from './GetUpdateService.js'
import TradeMapService from './TradeMapService.js'
import logger from '../helpers/logger.js'
import { getOrderVol, makeID } from '../helpers/helper.js'
import { masterPartialVol } from '../helpers/partialClose.js'

// #.
// بستن بخشی گزارش‌شده از سمت کاربر (متاتریدر کاربر با 500 / 501 یا FP Trader با 501) ؛ مشترک بین HandleNewOrder و handleClose
//
// data: خروجی processMessage همان handler (accountObj ، platform ، partial_item ، ...)
// closedCommission: کمیسیون بخش بسته‌شده کاربر (501 ⇐ فیلد اصلی پیام ، 500 ⇐ آیتم partial)
//
// برای هر copier:
//   ۱. حجم بستن روی Master متناسب با حجم باز همان Master (helpers/partialClose.masterPartialVol)
//   ۲. partial ⇒ دستور PARTIAL_CLOSE (22) ؛ رکورد TradeMap در پاسخ 978 (handleResPartialClose) تقسیم می‌شود
//      (سمت src بخش بسته‌شده هم همان‌جا از روی GetUpdate پر می‌شود تا اگر Master نتوانست ، رکورد باز دست‌نخورده بماند)
//   ۳. حجم ناممکن روی Master (کمتر از vol_min):
//      پنل ⇒ رد و پیام خطا (چیزی ساخته نمی‌شود)
//      متاتریدر کاربر (خودش بسته است) ⇒ نزدیک‌ترین حالت ممکن: باقیمانده خیلی کم ⇒ بستن کل Master ،
//      بخش بسته خیلی کم ⇒ کاری روی Master انجام نمی‌شود و فقط نگاشت به تیکت باقیمانده کاربر منتقل می‌شود
// خروجی: { msg, keyid, error }
export async function processUserPartial(data, closedCommission) {

    const result = { msg: '', keyid: undefined, error: null }
    const account = data.accountObj

    // #.
    // بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه
    if (!account.copy) {
        result.msg = '| copy is disabled for account |'
        result.error = 'Account Is Disabled'
        return result
    }

    const partialInfo = { ...data.partial_item, keyid: makeID(), platform: data.platform }

    // #.
    // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر
    const tradeMaps = await TradeMap.find({ acc_src: account.acc, ticket_src: partialInfo.closed_ticket })

    for (const copier of account.copiers) {
        if (!copier.copy) continue

        const openTradeMap = tradeMaps.find(t => t.acc_dist == copier.acc && t.status == 'open')

        // #.
        // کمیسیون سمت کاربر برای رکورد باقیمانده (منطق قبلی: کمیسیون تجمیعی متاتریدر 5 کاربر)
        const sumCommissions = tradeMaps.reduce((s, t) => t.acc_dist === copier.acc ? s + (t.commission_src ?? 0) : s, 0)
        let newCommission = 0
        if (Number(closedCommission) < sumCommissions) {
            newCommission = Math.round((Number(closedCommission) - sumCommissions) * 100) / 100
        }
        partialInfo.origin_new_commission = newCommission

        // #.
        // حجم بستن روی Master
        let plan
        if (openTradeMap) {
            const symbol = await Symbol.findOne({ server: openTradeMap.server_dist || copier.server, symbol: openTradeMap.symbol_dist }).lean()
            plan = masterPartialVol(openTradeMap.vol_dist, partialInfo.closed_vol, partialInfo.open_vol, symbol)
        } else {
            // معامله هنوز روی Master باز نشده (دستور waiting) ⇒ همان فرمول حجم سفارش
            plan = { action: 'partial', vol: getOrderVol(copier.vol_factor, partialInfo.closed_vol, copier.cent) }
        }

        if (plan.action !== 'partial' && data.platform === 'panel') {
            result.error = `partial close is not possible for this volume (master ${openTradeMap?.vol_dist} lots ⇒ close ${plan.action === 'skip' ? plan.vol : 'all'})`
            result.msg += `| ${result.error} |`
            continue
        }

        if (plan.action === 'skip') {
            // #.
            // بخش بسته‌شده روی Master کمتر از حداقل حجم ⇒ Master دست نمی‌خورد ؛ نگاشت به تیکت باقیمانده کاربر می‌رود
            // (متاتریدر 4 کاربر تیکت تازه دارد ؛ بدون این ، بستن بعدی کاربر هیچ معامله‌ای روی Master پیدا نمی‌کرد)
            logger.warn(`[partial] acc ${account.acc} ticket ${partialInfo.closed_ticket}: closed part is below master vol_min (${plan.vol}) / master unchanged`)
            openTradeMap.ticket_src = partialInfo.open_ticket
            openTradeMap.vol_src = partialInfo.open_vol
            await openTradeMap.save()
            await TradeMapService.sync({ event: 'updated', data: [openTradeMap.toObject()] })
            result.msg += `| partial close skipped on copier ${copier.acc} (below vol_min) |`
            continue
        }

        let getUpdateData
        if (plan.action === 'close') {
            // #.
            // باقیمانده روی Master کمتر از حداقل حجم می‌شد ⇒ کل Master بسته می‌شود (پاسخ 996 ، HandleResClose)
            logger.warn(`[partial] acc ${account.acc} ticket ${partialInfo.closed_ticket}: master remainder would be below vol_min / full close on master`)
            getUpdateData = await GetUpdateService.prepareCloseData(account, copier, partialInfo, openTradeMap)
            openTradeMap.close_price_src = partialInfo.closed_price
            openTradeMap.close_time_src = getUpdateData.origin_close_time
            openTradeMap.close_timestamp_src = partialInfo.closed_timestamp
            openTradeMap.swap_src = partialInfo.closed_swap
            openTradeMap.profit_src = partialInfo.closed_profit
            openTradeMap.vol_src = partialInfo.closed_vol
            await openTradeMap.save()
            result.msg += `| partial close processed as full close for copier ${copier.acc} |`
        } else {
            partialInfo.master_vol = plan.vol
            getUpdateData = await GetUpdateService.preparePartialCloseData(account, copier, partialInfo, openTradeMap)
            result.msg += `| partial close processed for copier ${copier.acc} |`
        }

        const created = await GetUpdateService.create(getUpdateData)
        result.keyid = created?.keyid
    }

    return result
}

export default {
    processUserPartial,
}

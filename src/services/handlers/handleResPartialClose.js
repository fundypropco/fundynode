import GetUpdateService from "../GetUpdateService.js"
import { formatDateUTC } from '../../helpers/helper.js'
import TradeMap from '../../models/TradeMap.js'
import { getBrokerData } from "../../boot/cache.js"
import Symbol from "../../models/Symbol.js"
import TradeMapService from "../TradeMapService.js"
import logger from '../../helpers/logger.js'
import { splitCommission } from '../../helpers/partialClose.js'

// #.
// نتیجه بستن بخشی روی Master (دستور PARTIAL_CLOSE 22 ⇒ پاسخ 978)
//
// رکورد باز TradeMap به دو رکورد تقسیم می‌شود:
//   بخش بسته‌شده ⇐ همان رکورد (status = closed ، closing_type = partial)
//   باقیمانده   ⇐ رکورد تازه با تیکت‌های تازه (متاتریدر 4) یا همان تیکت Master (متاتریدر 5)
// هر دو partial_code یکسان دارند تا پنل تکه‌های یک معامله را کنار هم نشان دهد (چند بار بستن بخشی ⇒ همه با همان کد)
//
// متاتریدر 4 و 5 Master:
//   تیکت باقیمانده = تیکت بسته‌شده ⇒ متاتریدر 5: کمیسیون گزارش‌شده تجمیعی کل پوزیشن است
//   تیکت تازه                    ⇒ متاتریدر 4: کمیسیون گزارش‌شده فقط مال تیکت بسته‌شده است
//   (helpers/partialClose.splitCommission ؛ همین قاعده برای commission_final)
// swap_final / commission_final (نرخ شرکت) از 2026-10-17 در انتهای پیام می‌آیند ؛ EA قدیمی ⇒ کمیسیون متناسب با حجم و سواپ شرکتی 0
export default async (req, res) => {

    // #.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    if (getUpdateDoc && getUpdateDoc.status == 'success') {
        // #.
        // دریافت اطلاعات بروکر و نماد
        const symbol = await Symbol.findOne({ server: getUpdateDoc.server, symbol: getUpdateDoc.symbol }).lean()
        const brokerData = await getBrokerData(getUpdateDoc.server)
        const diff_time = Number(brokerData?.diff_time ?? 0)

        // #.
        // پیدا کردن تریدهای مرتبط با این ترید
        // اگر روی متاتریدر 5 قبلا پارشیال شده باشد چند رکورد با تیکت یکسان داریم و کمیسیون تجمیعی است
        const tradeMaps = await TradeMap.find({
            acc_dist: data.acc,
            ticket_dist: data.closed_ticket
        })

        // #.
        // پیدا کردن معامله باز جهت ثبت اطلاعات و تغییر وضعیت به بسته شده
        const openTradeMap = tradeMaps.find(t => t.status === 'open')
        if (openTradeMap) {
            const sameTicket = Number(data.open_ticket) === Number(data.closed_ticket)
            const masterTotal = Number(data.closed_vol) + Number(data.open_vol)
            const ratio = masterTotal > 0 ? Number(data.closed_vol) / masterTotal : 0

            // #.
            // تقسیم کمیسیون (عدد خام EA) بین بخش بسته و باقیمانده
            const commission = splitCommission(
                openTradeMap.commission_dist,
                tradeMaps.reduce((s, t) => s + (t.commission_dist ?? 0), 0),
                data.commission,
                ratio,
                sameTicket
            )
            const commissionFinal = splitCommission(
                openTradeMap.commission_final,
                tradeMaps.reduce((s, t) => s + (t.commission_final ?? 0), 0),
                data.commission_final,
                ratio,
                sameTicket
            )
            if (data.commission_final === null) {
                logger.warn(`[978] master ${data.acc} ticket ${data.closed_ticket}: no swap_final/commission_final in message (old EA) / commission_final split by volume`)
            }

            const partialCode = openTradeMap.partial_code || Date.now()

            // #.
            // بخش بسته‌شده (سمت src از روی دستور ؛ PartialCloseService عمدا رکورد باز را تا این لحظه دست نمی‌زند)
            openTradeMap.vol_src = getUpdateDoc.origin_vol || openTradeMap.vol_src
            if (getUpdateDoc.origin_close_timestamp) {
                openTradeMap.close_price_src = getUpdateDoc.origin_close_price
                openTradeMap.close_time_src = getUpdateDoc.origin_close_time
                openTradeMap.close_timestamp_src = getUpdateDoc.origin_close_timestamp
                openTradeMap.swap_src = getUpdateDoc.origin_swap ?? 0
                openTradeMap.profit_src = getUpdateDoc.origin_profit ?? 0
            }

            openTradeMap.vol_dist = data.closed_vol
            openTradeMap.close_price_dist = data.closed_price
            openTradeMap.close_time_dist = formatDateUTC(data.closed_timestamp + diff_time)
            openTradeMap.close_timestamp_dist = data.closed_timestamp + diff_time
            openTradeMap.profit_dist = data.profit
            openTradeMap.swap_dist = data.swap
            openTradeMap.swap_final = data.swap_final ?? 0
            openTradeMap.commission_dist = commission.closed
            openTradeMap.commission_final = commissionFinal.closed
            openTradeMap.status = 'closed'
            openTradeMap.closing_type = 'partial'
            openTradeMap.partial_code = partialCode
            await openTradeMap.save()

            // #.
            // مپ کردن اکانت و تیکت های مرجع و کپی کننده باقیمانده
            const newOpenTradeMap = new TradeMap({
                server_src: openTradeMap.server_src || getUpdateDoc.origin_server,
                acc_src: getUpdateDoc.origin_acc,
                ticket_src: getUpdateDoc.origin_new_ticket,
                symbol_src: openTradeMap.symbol_src,
                vol_src: getUpdateDoc.origin_new_vol,
                open_price_src: getUpdateDoc.origin_open_price || openTradeMap.open_price_src,
                sl_src: openTradeMap.sl_src,
                tp_src: openTradeMap.tp_src,
                open_time_src: getUpdateDoc.origin_open_time || openTradeMap.open_time_src,
                open_timestamp_src: getUpdateDoc.origin_open_timestamp || openTradeMap.open_timestamp_src,
                magic_src: openTradeMap.magic_src,
                comment_src: openTradeMap.comment_src,
                commission_src: getUpdateDoc.origin_new_commission ?? 0,

                server_dist: getUpdateDoc.server,
                acc_dist: data.acc,
                ticket_dist: data.open_ticket,
                symbol_dist: openTradeMap.symbol_dist,
                vol_dist: data.open_vol,
                open_price_dist: data.open_price || openTradeMap.open_price_dist,
                open_time_dist: data.open_timestamp ? formatDateUTC(data.open_timestamp + diff_time) : openTradeMap.open_time_dist,
                open_timestamp_dist: data.open_timestamp ? data.open_timestamp + diff_time : openTradeMap.open_timestamp_dist,
                sl_dist: data.sl,
                tp_dist: data.tp,
                magic_dist: data.magic,
                comment_dist: data.comment,
                commission_dist: commission.remain,
                commission_final: commissionFinal.remain,
                vol_factor: openTradeMap.vol_factor,
                cent: openTradeMap.cent,

                symbol_title: openTradeMap.symbol_title,
                symbol_weight: openTradeMap.symbol_weight,
                side: openTradeMap.side,
                status: 'open',
                // #. ارزش تیک یک لات (مثل HandleResNewOrder) ؛ قبلا ضربدر حجم ذخیره می‌شد و سود شناور پنل غلط بود
                tick_value: Number(symbol?.tick_value ?? openTradeMap.tick_value ?? 0),
                tick_size: Number(symbol?.tick_size ?? openTradeMap.tick_size ?? 0),
                platform: openTradeMap.platform,
                partial_code: partialCode,
            })
            await newOpenTradeMap.save()

            // #.
            // پنل: بخش بسته‌شده و باقیمانده (هر دو با partial_code) ؛ پنل با map_id (= _id) ردیف‌ها را یکتا می‌کند
            await TradeMapService.sync({ event: 'closed', data: [openTradeMap.toObject()] })
            await TradeMapService.sync({ event: 'created', data: [newOpenTradeMap.toObject()] })
        } else {
            logger.warn(`[978] master ${data.acc} ticket ${data.closed_ticket}: open trade map not found`)
        }

        // #.
        // ارسال دستورات در وضعیت انتظار و وابسته به این دیتا
        await GetUpdateService.updateWaitings(getUpdateDoc.origin_acc, getUpdateDoc.origin_new_ticket, data.open_ticket, getUpdateDoc)
    }

    res.send({
        status: 'success',
    })
}

function optionalNumber(value) {
    if (value === undefined || value === null || String(value).trim() === '') return null
    const n = Number(value)
    return Number.isFinite(n) ? n : null
}

function processMessage(msg) {
    // E.g.
    // acc , 978 , OK PARTIAL & closed-ticket & open-ticket & open-vol & closed_timestamp & close_price & swap & commission & profit & magic & comment & sl & tp & open_price & open_timestamp & closed_vol & swap_final & commission_final , timestamp, keyid
    // acc , 978 , CANT PARTIAL & error , timestamp , keyid
    // (swap_final و commission_final از 2026-10-17 ؛ EA قدیمی ندارد)
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].split('_')[0])
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = Number(msg_parts[3])
    let info = msg_parts[2]
    data.keyid = Number(msg_parts[4])

    // msg info
    const info_parts = info.split('_&_')
    data.result_text = info_parts[0]
    data.result_code = 0

    if (data.result_text.toLowerCase().includes('ok')) {
        data.status = 'success'
        data.closed_ticket = Number(info_parts[1])
        data.open_ticket = Number(info_parts[2])
        data.open_vol = Number(info_parts[3])
        data.closed_timestamp = Number(info_parts[4])
        data.closed_price = Number(info_parts[5])
        data.swap = Number(info_parts[6])
        data.commission = Number(info_parts[7])
        data.profit = Number(info_parts[8])
        data.magic = Number(info_parts[9])
        data.comment = info_parts[10]
        data.sl = Number(info_parts[11])
        data.tp = Number(info_parts[12])
        data.open_price = Number(info_parts[13])
        data.open_timestamp = Number(info_parts[14])
        data.closed_vol = Number(info_parts[15])
        data.swap_final = optionalNumber(info_parts[16])
        data.commission_final = optionalNumber(info_parts[17])
    } else {
        data.status = 'error'
        data.result_code = info_parts[1]
    }

    return data
}

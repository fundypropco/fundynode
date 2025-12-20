import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateUTC } from '../../helpers/helper.js'
import TradeMap from '../../models/TradeMap.js'
import { getBrokerData } from "../../boot/cache.js"
import AccountService from "../AccountService.js"

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی 
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات 
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    if (getUpdateDoc && getUpdateDoc.status == 'success') {
        // #.
        // دریافت اطلاعات بروکر
        const brokerData = await getBrokerData(getUpdateDoc.server)
        const diff_time = Number(brokerData.diff_time)

        // #. 
        // پیدا کردن تریدهای مرتبط با این ترید
        // اگر روی متاتریدر 5 پارشیال شده باشد چند رکورد با تیکت یکسان داریم و کمیسیون تجمیعی است
        const tradeMaps = await TradeMap.find({
            acc_src: getUpdateDoc.origin_acc,
            ticket_src: getUpdateDoc.origin_ticket,
            acc_dist: data.acc,
            ticket_dist: data.closed_ticket
        })

        // #.
        // محاسبه کمیسیون های تجمیعی لحاظ شده برای این معامله تا کنون
        const sumCommissions = tradeMaps.reduce((s, t) => s + (t.commission_dist ?? 0), 0)

        // #.
        // اگر مقدار کمیسیون گزارش شده از کمیسیون های تجمیعی بیشتر باشد
        let new_commission_dist = 0
        if (data.commission < sumCommissions) {
            new_commission_dist = Math.round((data.commission - sumCommissions) * 100) / 100
        }

        // #. 
        // پیدا کردن معامله باز جهت ثبت اطلاعات و تغییر وضعیت به بسته شده
        const openTradeMap = tradeMaps.find(t => t.status === 'open')
        if (openTradeMap) {
            openTradeMap.vol_dist = data.closed_vol
            openTradeMap.close_price_dist = data.closed_price
            openTradeMap.close_time_dist = formatDateUTC(data.closed_timestamp + diff_time)
            openTradeMap.close_timestamp_dist = data.closed_timestamp + diff_time
            openTradeMap.profit_dist = data.profit
            openTradeMap.swap_dist = data.swap
            openTradeMap.status = 'closed'
            openTradeMap.closing_type = 'partial'
            await openTradeMap.save()
        }

        // #.
        // مپ کردن اکانت و تیکت های مرجع و کپی کننده باقیمانده 
        const newOpenTradeMap = new TradeMap({
            server_src: getUpdateDoc.origin_server,
            acc_src: getUpdateDoc.origin_acc,
            ticket_src: getUpdateDoc.origin_new_ticket,
            symbol_src: openTradeMap.symbol_src,
            vol_src: getUpdateDoc.origin_new_vol,
            open_price_src: getUpdateDoc.origin_open_price,
            sl_src: openTradeMap.sl_src,
            tp_src: openTradeMap.tp_src,
            open_time_src: getUpdateDoc.origin_open_time,
            open_timestamp_src: getUpdateDoc.origin_open_timestamp,
            commission_src: getUpdateDoc.origin_new_commission,

            server_dist: getUpdateDoc.server,
            acc_dist: data.acc,
            ticket_dist: data.open_ticket,
            symbol_dist: openTradeMap.symbol_dist,
            vol_dist: data.open_vol,
            open_price_dist: data.open_price,
            open_time_dist: formatDateUTC(data.open_timestamp + diff_time),
            open_timestamp_dist: data.open_timestamp + diff_time,
            sl_dist: data.sl,
            tp_dist: data.tp,
            magic_dist: data.magic,
            comment_dist: data.comment,
            commission_dist: new_commission_dist,

            symbol_title: openTradeMap.symbol_title,
            symbol_weight: openTradeMap.symbol_weight,
            side: openTradeMap.side,
            status: 'open',
            tick_value: Number((symbol.tick_value * data.open_vol).toFixed(2)),
        })
        await newOpenTradeMap.save()

        // #.
        // ثبت اطلاعات مالی در بالانس و بررسی دراودان 
        const profit_bl = Math.round((data.profit + data.swap + new_commission_dist) * 100) / 100
        await AccountService.updateProfitBl(getUpdateDoc.origin_acc, data.acc, profit_bl)

        // #.
        // ارسال دستورات در وضعیت انتظار و وابسته به این دیتا 
        await GetUpdateService.updateWaitings(getUpdateDoc.origin_acc, getUpdateDoc.origin_new_ticket, data.open_ticket, getUpdateDoc)
    }

    // 6.
    // لاگ گرفتن از رکوئست دریافتی 
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
        message: req.body.message,
        datetime: Date.now()
    })
    await requestLog.save()

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456 , 978 , OK PARTIAL & old_ticket & new_ticket & remain_lots & close_timestamp & close_price & swap & commision & profit & error , 1758983673 , id
    // 1006135456, 978, CANT PARTIAL & error, 1758983673, id
    // acc , 978 , OK PARTIAL & closed-ticket & open-ticket & open-vol & closed_timestamp & close_price & swap & commission & profit & result_code , timestamp, keyid
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].split('_')[0])
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = Number(msg_parts[3])
    let info = msg_parts[2]
    data.keyid = Number(msg_parts[4])

    // msg info
    const info_parts = info.split('&')
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
    } else {
        data.status = 'error'
        data.result_code = info_parts[1]
    }

    return data
}

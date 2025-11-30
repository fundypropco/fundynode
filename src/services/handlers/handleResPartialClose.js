import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDate, formatDateYMD } from '../../helpers/helper.js'
import TradeMap from '../../models/TradeMap.js'
import Symbol from "../../models/Symbol.js"
import Account from "../../models/Account.js"

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی 
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات 
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    if (getUpdateDoc && getUpdateDoc.status == 'success') {
        // #.
        // بستن معامله کلوز شده در تیکت مپ 
        const closedTradeMap = await TradeMap.findOneAndUpdate(
            { acc_src: getUpdateDoc.origin_acc, ticket_src: getUpdateDoc.origin_ticket, acc_dist: data.acc },
            {
                $set: {
                    status: 'closed',

                    vol_src: getUpdateDoc.origin_vol,
                    close_price_src: getUpdateDoc.closed_price,
                    close_time_src: getUpdateDoc.origin_close_time,
                    close_timestamp_src: getUpdateDoc.origin_close_timestamp,
                    close_time_utc_src: getUpdateDoc.origin_close_time_utc,
                    swap_src: getUpdateDoc.origin_swap,
                    commission_src: getUpdateDoc.origin_commission,
                    profit_src: getUpdateDoc.origin_profit,

                    vol_dist: data.closed_vol,
                    close_price_dist: data.closed_price,
                    close_time_dist: formatDate(data.closed_timestamp),
                    close_timestamp_dist: data.closed_timestamp,
                    close_time_utc_dist: data.closed_timestamp,
                    swap_dist: data.swap,
                    commission_dist: data.commission,
                    profit_dist: data.profit
                }
            },
            {
                new: true
            }
        )

        const symbol = await Symbol.findOne({ server: getUpdateDoc.server, symbol: getUpdateDoc.symbol })

        // #.
        // مپ کردن اکانت و تیکت های مرجع و کپی کننده باقیمانده 
        const tradeMap = new TradeMap({
            server_src: getUpdateDoc.origin_server,
            acc_src: getUpdateDoc.origin_acc,
            ticket_src: getUpdateDoc.origin_new_ticket,
            symbol_src: closedTradeMap.symbol_src,
            vol_src: getUpdateDoc.origin_new_vol,
            open_price_src: getUpdateDoc.origin_open_price,
            sl_src: closedTradeMap.sl_src,
            tp_src: closedTradeMap.tp_src,
            open_time_src: getUpdateDoc.origin_open_time,
            open_timestamp_src: getUpdateDoc.origin_open_timestamp,
            open_time_utc_src: getUpdateDoc.origin_open_time_utc,

            server_dist: getUpdateDoc.server,
            acc_dist: data.acc,
            ticket_dist: data.open_ticket,
            symbol_dist: closedTradeMap.symbol_dist,
            vol_dist: data.open_vol,
            open_price_dist: data.open_price,
            open_time_dist: formatDate(data.open_timestamp),
            open_timestamp_dist: data.open_timestamp,
            open_time_utc_dist: data.open_timestamp,
            sl_dist: data.sl,
            tp_dist: data.tp,
            magic_dist: data.magic,
            comment_dist: data.comment,

            symbol_title: closedTradeMap.symbol_title,
            symbol_weight: closedTradeMap.symbol_weight,
            side: closedTradeMap.side,
            status: 'open',
            tick_value: Number((symbol.tick_value * data.open_vol).toFixed(2)),
        })
        await tradeMap.save()

        // #.
        // ثبت اطلاعات مالی در بالانس 
        const total_closed_profit = data.profit + data.swap + data.commission
        await Account.findOneAndUpdate(
            { acc: closedTradeMap.acc_src, "copiers.acc": closedTradeMap.acc_dist },
            { $inc: { "copiers.$.profit_bl": total_closed_profit } }, //$[c]
            // { arrayFilters: [{ "c.acc": acc }] }
            { new: true }
        )

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
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    let info = msg_parts[2]
    data.keyid = msg_parts[4]

    // msg info
    const info_parts = info.split('&')
    data.result_text = info_parts[0]
    data.result_code = 0

    if (data.result_text.toLowerCase().includes('ok')) {
        data.status = 'success'
        data.closed_ticket = info_parts[1]
        data.open_ticket = info_parts[2]
        data.open_vol = Number(info_parts[3])
        data.closed_timestamp = info_parts[4] * 1000
        data.closed_price = Number(info_parts[5])
        data.swap = Number(info_parts[6])
        data.commission = Number(info_parts[7])
        data.profit = Number(info_parts[8])
        data.magic = Number(info_parts[9])
        data.comment = info_parts[10]
        data.sl = Number(info_parts[11])
        data.tp = Number(info_parts[12])
        data.open_price = Number(info_parts[13])
        data.open_timestamp = info_parts[14] * 1000
        data.closed_vol = Number(info_parts[15])
    } else {
        data.status = 'error'
        data.result_code = info_parts[1]
    }

    return data
}

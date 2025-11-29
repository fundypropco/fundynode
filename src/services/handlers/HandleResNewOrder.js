import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from '../GetUpdateService.js'
import TradeMap from '../../models/TradeMap.js'
import Account from "../../models/Account.js"
import Symbol from "../../models/Symbol.js"
import { formatDate } from "../../helpers/helper.js"

export default async (req, res) => {

    // #. 
    // پردازش دیتای ورودی
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    if (getUpdateDoc.status == 'success') {
        const symbol = await Symbol.findOne({ server: getUpdateDoc.server, symbol: getUpdateDoc.symbol })

        // #.
        // مپ کردن اکانت و تیکت های مرجع و کپی کننده 
        const tradeMap = new TradeMap({
            server_src: getUpdateDoc.origin_server,
            acc_src: getUpdateDoc.origin_acc,
            ticket_src: getUpdateDoc.origin_ticket,
            symbol_src: getUpdateDoc.origin_symbol,
            vol_src: getUpdateDoc.origin_vol,
            open_price_src: getUpdateDoc.origin_open_price,
            sl_src: getUpdateDoc.origin_sl,
            tp_src: getUpdateDoc.origin_tp,
            open_time_src: getUpdateDoc.origin_open_time,
            open_timestamp_src: getUpdateDoc.origin_open_timestamp,
            open_time_utc_src: getUpdateDoc.origin_open_time_utc,
            magic_src: getUpdateDoc.origin_magic,
            comment_src: getUpdateDoc.origin_comment,

            acc_dist: data.acc,
            ticket_dist: data.ticket,
            server_dist: getUpdateDoc.server,
            symbol_dist: getUpdateDoc.symbol,
            vol_dist: data.vol,
            sl_dist: data.sl,
            tp_dist: data.tp,
            open_price_dist: data.open_price,
            open_time_dist: formatDate(data.open_timestamp),
            open_timestamp_dist: data.open_timestamp,
            open_time_utc_dist: data.open_timestamp,
            magic_dist: data.magic,
            comment_dist: data.comment,

            symbol_title: getUpdateDoc.symbol_title,
            side: getUpdateDoc.side,
            status: (() => {
                if (['buy', 'sell'].includes(getUpdateDoc.side)) return 'open'
                if (['buy_limit', 'buy_stop', 'sell_limit', 'sell_stop'].includes(getUpdateDoc.side)) return 'pending'
                return ''
            })(),
            tick_value: Number((symbol.tick_value * getUpdateDoc.vol).toFixed(2)),
            symbol_weight: symbol.weight
        })
        await tradeMap.save()

        // #.
        // ارسال دستورات در وضعیت انتظار و وابسته به این دیتا 
        await GetUpdateService.updateWaitings(getUpdateDoc.origin_acc, getUpdateDoc.origin_ticket, data.ticket, getUpdateDoc)
    } else {
        const account = await Account.findOne({ acc: getUpdateDoc.origin_acc, server: getUpdateDoc.origin_server })
        if (account && account.copiers?.length == 1) {
            const getUpdateData = await GetUpdateService.prepareCloseOriginData(account, {
                description: [`Copier Error: ${data.result_text} / ${getMqlError(data.result_code)}`],
                keyid: makeID(),
                side: getUpdateDoc.side,
                ticket: getUpdateDoc.origin_ticket,
                origin_ticket: getUpdateDoc.origin_ticket,
                symbol: getUpdateDoc.origin_symbol,
                symbol_title: getUpdateDoc.symbol_title,
                origin_symbol: getUpdateDoc.origin_symbol,
                vol: getUpdateDoc.origin_vol,
                origin_vol: getUpdateDoc.origin_vol
            })
            await GetUpdateService.create(getUpdateData)
        }
    }

    // #.
    // لاگ گرفتن از رکوئست دریافتی
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
        message: req.body.message,
        datetime: Date.now()
    })
    await requestLog.save()

    // #. 
    // ارسال پاسخ عملیات موفقیت آمیز
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,999,OK OPEN BUY&324252360&0,1758983673,6
    // acc , 999 , OK OPEN BUY & ticket & result_code , timestamp , keyid
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3] * 1000
    data.keyid = msg_parts[4]
    const info = msg_parts[2]

    // msg info
    const info_parts = info.split('&')
    data.result_text = info_parts[0]
    data.result_code = 0

    if (data.result_text.toLowerCase().includes('ok')) {
        data.status = 'success'
        data.ticket = info_parts[1]
        data.open_timestamp = info_parts[2] * 1000
        data.vol = info_parts[3]
        data.open_price = info_parts[4]
        data.sl = info_parts[5]
        data.tp = info_parts[6]
        data.magic = info_parts[7]
        data.comment = info_parts[8]
    } else {
        data.status = 'error'
        data.result_code = info_parts[2]
    }

    return data
}

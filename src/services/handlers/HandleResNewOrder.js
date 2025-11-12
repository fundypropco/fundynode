import RequestLog from "../../models/RequestLog.js"
import { formatDateYMD, makeMsgForHandler } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeTicket from '../../models/TradeTicket.js'
import { ACTION_HANDLER } from "../../helpers/constant.js"
import Account from "../../models/Account.js"
import Symbol from "../../models/Symbol.js"

export default async (req, res) => {

    // #. 
    // پردازش دیتای ورودی
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    if (getUpdateDoc.status == 'success') {
        const symbol = await Symbol.findOne({ server: getUpdateDoc.server, symbol: getUpdateDoc.symbol })
        const vol = getUpdateDoc.vol

        // #.
        // مپ کردن اکانت و تیکت های مرجع و کپی کننده 
        const tradeTicket = new TradeTicket({
            acc_src: getUpdateDoc.origin_acc,
            ticket_src: getUpdateDoc.origin_ticket,
            server_src: getUpdateDoc.origin_server,
            symbol_src: getUpdateDoc.origin_symbol,
            acc_dist: data.acc,
            ticket_dist: data.ticket,
            server_dist: getUpdateDoc.server,
            symbol_dist: getUpdateDoc.symbol,
            symbol_title: getUpdateDoc.symbol_title,
            side: (() => {
                if ([ACTION_HANDLER.BUY, ACTION_HANDLER.BUYLIMIT, ACTION_HANDLER.BUYSTOP].includes(data.handler)) return 'buy'
                if ([ACTION_HANDLER.SELL, ACTION_HANDLER.SELLLIMIT, ACTION_HANDLER.SELLSTOP].includes(data.handler)) return 'sell'
                return ''
            })(),
            status: (() => {
                if ([ACTION_HANDLER.BUY, ACTION_HANDLER.SELL].includes(data.handler)) return 'open'
                if ([ACTION_HANDLER.BUYLIMIT, ACTION_HANDLER.BUYSTOP, ACTION_HANDLER.SELLLIMIT, ACTION_HANDLER.SELLSTOP].includes(data.handler)) return 'pending'
                return ''
            })(),
            tick_value: Number((symbol.tick_value * vol).toFixed(2)),
        })
        await tradeTicket.save()

        // #.
        // ارسال دستورات در وضعیت انتظار و وابسته به این دیتا
        await GetUpdateService.updateWaitings(getUpdateDoc.origin_acc, getUpdateDoc.origin_ticket, data.ticket, getUpdateDoc)
    } else {
        const account = await Account.findOne({ acc: getUpdateDoc.origin_acc, server: getUpdateDoc.origin_server })
        if (account && account.copiers?.length == 1) {
            const order = {}
            order.handler = ACTION_HANDLER.CLOSE_ORIGIN
            order.status = 'pending'
            order.acc = order.origin_acc = getUpdateDoc.origin_acc
            order.ticket = order.origin_ticket = getUpdateDoc.origin_ticket
            order.symbol = order.origin_symbol = getUpdateDoc.origin_symbol
            order.server = order.origin_server = getUpdateDoc.origin_server
            order.symbol_title = getUpdateDoc.symbol_title
            order.description = [`Copier Error: ${data.result_text} / ${getMqlError(data.result_code)}`]
            order.keyid = makeID()
            order.message = await makeMsgForHandler(order.handler, order)
            await GetUpdateService.create(order)
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
    data.acc = msg_parts[0].replace(/_.*/, '')
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    data.keyid = msg_parts[4]
    const info = msg_parts[2]

    // msg info
    const info_parts = info.split('&')
    data.result_text = info_parts[0]
    data.ticket = info_parts[1]
    data.result_code = info_parts[2]
    data.status = data.result_code == 0 ? 'success' : 'error'

    return data
}

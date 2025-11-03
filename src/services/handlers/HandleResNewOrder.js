import RequestLog from "../../models/RequestLog.js"
import { formatDateYMD, makeMsgForHandler } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeTicket from '../../models/TradeTicket.js'
import GetUpdate from "../../models/GetUpdate.js"
import { ACTION_HANDLER } from "../../helpers/constant.js"
import Account from "../../models/Account.js"

export default async (req, res) => {

    // 1. 
    // پردازش دیتای ورودی
    const data = processMessage(req.body.message)

    // 2.
    // بروزرسانی وضعیت دستور در صف دستورات
    await GetUpdateService.updateStatus(data)

    const getUpdateDoc = await GetUpdate.findOne({
        acc: data.acc,
        handler: data.handler,
        keyid: data.keyid,
    })
    if (getUpdateDoc.status == 'success') {
        // 3.
        // مپ کردن اکانت و تیکت های مرجع و کپی کننده 
        const originOrderAcc = getUpdateDoc.origin_acc
        const originOrderTicket = getUpdateDoc.origin_ticket
        const tradeTicket = new TradeTicket({
            acc_src: originOrderAcc,
            ticket_src: originOrderTicket,
            acc_dist: data.acc,
            ticket_dist: data.ticket
        })
        await tradeTicket.save()

        // 4.
        // ارسال دستورات در وضعیت انتظار و وابسته به این دیتا
        await GetUpdateService.updateWaitings(originOrderAcc, originOrderTicket, data.ticket)
    } else {
        const account = await Account.findOne({ acc: getUpdateDoc.origin_acc, server: getUpdateDoc.origin_server })
        if (account && account.copiers?.length == 1) {
            const order = {}
            order.handler = ACTION_HANDLER.CLOSE_ORIGIN
            order.status = 'pending'
            order.acc = getUpdateDoc.origin_acc
            order.ticket = getUpdateDoc.origin_ticket
            order.symbol = getUpdateDoc.origin_symbol
            order.origin_acc = getUpdateDoc.acc
            order.origin_ticket = getUpdateDoc.ticket
            order.origin_symbol = getUpdateDoc.symbol
            order.symbol_title = getUpdateDoc.symbol_title
            order.description = [`Copier Error: ${data.result_text} / ${getMqlError(data.result_code)}`]
            order.keyid = makeID()
            order.message = await makeMsgForHandler(order.handler, order)
            await GetUpdateService.create(order)
        }
    }

    // 5.
    // لاگ گرفتن از رکوئست دریافتی
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
        message: req.body.message,
        datetime: Date.now()
    })
    await requestLog.save()

    // 6. 
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

import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD, makeMsgForHandler, makeID } from '../../helpers/helper.js'
import { ACTION_HANDLER } from '../../helpers/constant.js'
import TradeTicket from '../../models/TradeTicket.js'

export default async (req, res) => {

    // 1.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    // 2.
    // پیدا کردن اکانت مربوط به عملیات دریافتی
    const account = await Account.findOne({ acc: data.acc });

    // 3.
    // بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه
    if (account.copy) {

        let keyid = makeID()

        for (const order of data.items) {
            // 4.
            // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر
            const tickets = await TradeTicket.find({ acc_src: account.acc, ticket_src: order.ticket })

            // 5.
            // بدست آوردن اکانتهای کپی کننده
            for (const copier of account.copiers) {
                const copyTradeData = {}
                const copierOrder = tickets.find(t => t.acc_dist == copier.acc)

                copyTradeData.acc = copier.acc
                copyTradeData.handler = ACTION_HANDLER.MODIFY
                copyTradeData.keyid = keyid++
                copyTradeData.origin_acc = account.acc
                copyTradeData.origin_ticket = order.ticket
                copyTradeData.description = []
                copyTradeData.entry = order.entry
                copyTradeData.sl = order.sl
                copyTradeData.tp = order.tp

                if (copierOrder) {
                    copyTradeData.ticket = copierOrder.ticket_dist
                    copyTradeData.status = 'pending'
                    copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                    await GetUpdateService.create(copyTradeData)
                } else {
                    copyTradeData.ticket = '-1'
                    copyTradeData.status = 'waiting'
                    copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                    await GetUpdateService.create(copyTradeData)
                }
            }
        }
    }


    // 6.
    // لاگ گرفتن از رکوئست دریافتی
    const requestLog = new RequestLog({
        type: 'SendMessage',
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
    // 1006135456,502,NEW MODIFY&324253391&103420.04&0.00@102455&324253391&103420.04&0.00&102460,1758998794,-1
    // acc , 502 , NEW MODIFY & ticket & sl & tp & entry @ ticket & sl & tp & entry , timestamp , -1
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].replace(/_.*/, '')
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    let info = msg_parts[2]

    // msg info
    // حذف بخش اول عبارت به همراه اولین کاراکتر امپرساین
    info = info.replace(/^[^&]*&/, "")
    data.items = info.split("@")
        .map(part => part.split("&"))
        .map(([ticket, sl, tp, entry]) => ({ ticket, sl, tp, entry }))

    return data
}

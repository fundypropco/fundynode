import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD, makeMsgForHandler, makeID, getOrderVol } from '../../helpers/helper.js'
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


        // 4.
        // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر
        const tickets = await TradeTicket.find({ acc_src: account.acc, ticket_src: data.close_ticket })

        // 5.
        // بدست آوردن اکانتهای کپی کننده
        for (const copier of account.copiers) {
            const copyTradeData = {}
            const copierOrder = tickets.find(t => t.acc_dist == copier.acc)

            copyTradeData.acc = copier.acc
            copyTradeData.handler = ACTION_HANDLER.PARTIAL_CLOSE
            copyTradeData.keyid = makeID()
            copyTradeData.origin_acc = account.acc
            copyTradeData.origin_ticket = data.close_ticket
            copyTradeData.origin_new_ticket = data.open_ticket
            copyTradeData.description = []
            copyTradeData.vol = getOrderVol(account, copier, '', data.close_vol)

            if (copierOrder) {
                copyTradeData.ticket = copierOrder.ticket_dist
                copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                copyTradeData.status = 'pending'
                await GetUpdateService.create(copyTradeData)
            } else {
                copyTradeData.ticket = '?ticket?'
                copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                copyTradeData.status = 'waiting'
                await GetUpdateService.create(copyTradeData)
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
    // 1006135456,506,PARTIAL&324253391&103420.04&1&2025-10-14 22:08:23@324253391&103420.04&1&2025-10-14 22:08:23,1750019908,-1
    // acc , 506 , PARTIAL & open-ticket & open-price & open-vol & open-time @ close-ticket & close-price & close-vol & close-time , timestamp, -1
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0]
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    let info = msg_parts[2]

    // msg info
    // حذف بخش اول عبارت به همراه اولین کاراکتر امپرساین
    info = info.replace(/^[^&]*&/, "")
    const info_parts = info.split("@")
    const open_order = info_parts[0]
    const close_order = info_parts[1]
    const open_order_parts = open_order.split('&')
    data.open_ticket = open_order_parts[0]
    const close_order_parts = close_order.split('&')
    data.close_ticket = close_order_parts[0]
    data.close_vol = close_order_parts[2]

    return data
}

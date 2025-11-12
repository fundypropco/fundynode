import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD, getCopyTradeParams, makeMsgForHandler, isValidSymbols, makeID, getOrderVol } from '../../helpers/helper.js'
import { ACTION_HANDLER } from '../../helpers/constant.js'
import GetUpdate from '../../models/GetUpdate.js'
import TradeTicket from '../../models/TradeTicket.js'

export default async (req, res) => {

    //# پردازش پیام ورودی
    const data = processMessage(req.body.message)

    if (!data.is_partial) {
        // اگر سفارش جدید باشد
        await processNewOrder(data)
    } else {
        // اگر پارشیال کلوز باشد
        await processPartial(data)
    }

    //# لاگ گرفتن از رکوئست دریافتی
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

async function processNewOrder(data) {

    //# بررسی اینکه آیا این سفارش تکراری است یا خیر
    const is_duplicated = await isDuplicatedOrder(data)
    if (is_duplicated) {
        return
    }

    //# پیدا کردن اکانت مربوط به عملیات دریافتی
    const account = await Account.findOne({ acc: data.acc });

    //# بررسی اینکه آیا کپی ترید برای این اکانت فعال هست یا نه
    if (account.copy) {

        let keyid = makeID()

        //# بدست آوردن اکانتهای کپی کننده
        for (const copier of account.copiers) {
            const localData = JSON.parse(JSON.stringify(data))
            //# بررسی بروکر و نماد اکانت ترید و کپی
            //# بررسی امکان اجرای سفارش کپی

            const validatedSymbolData = await isValidSymbols(account, copier, localData)

            if (validatedSymbolData.is_valid_symbols) {
                // اگر نمادهای معاملاتی معتبر باشند

                localData.symbol_a = validatedSymbolData.symbol_a
                localData.symbol_b = validatedSymbolData.symbol_b

                //# بدست آوردن پارامتر های سفارش کپی
                const copyTradeData = await getCopyTradeParams(account, copier, localData)

                //# مقداردهی سایر پارامترها برای ثبت دستور اجرا سفارش
                copyTradeData.handler = ACTION_HANDLER[copyTradeData.type]
                copyTradeData.status = 'pending'
                copyTradeData.origin_acc = account.acc
                copyTradeData.origin_ticket = localData.ticket
                copyTradeData.origin_server = account.server
                copyTradeData.origin_symbol = localData.symbol_a.symbol
                copyTradeData.origin_vol = data.vol
                copyTradeData.symbol_title = localData.symbol_a.title
                copyTradeData.keyid = keyid++
                copyTradeData.open_price = localData.open_price
                copyTradeData.description = validatedSymbolData.description
                copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)

                //# ثبت دستور اجرای سفارش
                await GetUpdateService.create(copyTradeData)
            }
            else {
                // اگر نمادهای معاملاتی نامعتبر باشند

                //# بستن معامله در اکانت ترید
                const order = {}
                order.handler = ACTION_HANDLER.CLOSE_ORIGIN
                order.status = 'pending'
                order.acc = order.origin_acc = account.acc
                order.ticket = order.origin_ticket = data.ticket
                order.server = order.origin_server = account.server
                order.symbol = order.origin_symbol = data.symbol
                order.description = validatedSymbolData.description
                order.keyid = keyid++
                order.message = await makeMsgForHandler(order.handler, order)
                await GetUpdateService.create(order)

            }
        }//for
    }//if copy is enabled
}

async function processPartial(data) {

    //# پیدا کردن اکانت مربوط به عملیات دریافتی
    const account = await Account.findOne({ acc: data.acc });

    //# بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه
    if (account.copy) {

        let keyid = makeID()
        const order = data.partial_item

        //# بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر
        const tickets = await TradeTicket.find({ acc_src: account.acc, ticket_src: order.closed_ticket })

        //# بدست آوردن اکانتهای کپی کننده
        for (const copier of account.copiers) {
            const copyTradeData = {}
            const copierOrder = tickets.find(t => t.acc_dist == copier.acc)

            copyTradeData.acc = copier.acc
            copyTradeData.handler = ACTION_HANDLER.PARTIAL_CLOSE
            copyTradeData.keyid = keyid++
            copyTradeData.origin_acc = account.acc
            copyTradeData.origin_ticket = order.closed_ticket
            copyTradeData.origin_server = account.server
            copyTradeData.origin_new_ticket = order.open_ticket
            copyTradeData.description = []
            copyTradeData.origin_vol = order.closed_vol
            copyTradeData.vol = order.closed_vol //todo: calc vol - getOrderVol(account, copier, '', data.close_vol)

            if (copierOrder) {
                copyTradeData.origin_symbol = copierOrder.symbol_src
                copyTradeData.ticket = copierOrder.ticket_dist
                copyTradeData.server = copierOrder.server_dist
                copyTradeData.symbol = copierOrder.symbol_dist
                copyTradeData.symbol_title = copierOrder.symbol_title
                copyTradeData.status = 'pending'
                copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                await GetUpdateService.create(copyTradeData)
            } else {
                copyTradeData.ticket = -1
                copyTradeData.status = 'waiting'
                copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)
                await GetUpdateService.create(copyTradeData)
            }
        }
    }
}

async function isDuplicatedOrder(data) {
    // const is_dup = await GetUpdate.findOne({
    //     origin_acc: data.acc,
    //     origin_ticket: data.ticket,
    //     status: { $in: ['success', 'pending'] },
    //     handler: {
    //         $in: [
    //             ACTION_HANDLER.BUY,
    //             ACTION_HANDLER.BUYLIMIT,
    //             ACTION_HANDLER.BUYSTOP,
    //             ACTION_HANDLER.SELL,
    //             ACTION_HANDLER.SELLLIMIT,
    //             ACTION_HANDLER.SELLSTOP,
    //         ]
    //     }
    // })

    const is_duplicated = await TradeTicket.findOne({
        acc_src: data.acc,
        ticket_src: data.ticket,
    })

    if (is_duplicated && is_duplicated.status === 'pending' && ['BUY', 'SELL'].includes(data.type)) {
        await TradeTicket.updateMany({ acc_src: data.acc, ticket_src: data.ticket }, { $set: { status: 'open' } })
    }

    return !!is_duplicated
}

function processMessage(msg) {
    //E.g. 
    // 1006135456,500,NEW ORDER&324253368&BTCUSD&BUY&0.01&109245.51000&2025.09.27 18:05:14&0.00000&0.00000&-1.31000&0&,1758998114,-1
    // acc , 500 , NEW ORDER & ticket & symbol & type & vol & open_price & open_time & sl & tp & commission & magic & comment , timestamp , -1
    // partial → acc , 500 , NEW ORDER & ticket & symbol & type & vol & open_price & open_time & sl & tp & commission & magic & comment , timestamp , CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME ; CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].replace(/_.*/, '')
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    const info = msg_parts[2]
    const partial_info = msg_parts[4]
    data.is_partial = false

    // msg info
    const info_parts = info.split('&')
    data.ticket = info_parts[1]
    data.symbol = info_parts[2]
    data.type = info_parts[3].replace(/[\s_]/g, "").toUpperCase()
    data.vol = info_parts[4]
    data.open_price = info_parts[5]
    data.open_time = info_parts[6] //todo: بررسی این فیلد برای سفارشات پندینگ و همچنین درخواست از سعید برای تغییر فرمت آن
    data.sl = info_parts[7]
    data.tp = info_parts[8]
    data.commission = info_parts[9]
    data.magic = info_parts[10]
    data.comment = info_parts[11]

    if (partial_info != -1) {
        // partial
        data.partial_item = partial_info.split(";")
            .map(side => side.split("@"))
            .map(([closed_ticket, closed_vol, closed_time, open_ticket, open_vol, open_time]) => ({ closed_ticket, closed_vol, closed_time, open_ticket, open_vol, open_time }))
            .find(pi => pi.open_ticket == data.ticket)

        data.is_partial = !!data.partial_item
    }

    return data
}
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
        res.send({
            status: 'success',
            message: 'This order has already been received.',
        })
    }

    //# پیدا کردن اکانت مربوط به عملیات دریافتی
    const account = await Account.findOne({ acc: data.acc });

    //# بررسی اینکه آیا کپی ترید برای این اکانت فعال هست یا نه
    if (account.copy) {

        let keyid = makeID()

        //# بدست آوردن اکانتهای کپی کننده
        for (const copier of account.copiers) {
            //# بررسی بروکر و نماد اکانت ترید و کپی
            //# بررسی امکان اجرای سفارش کپی

            const validatedSymbolData = await isValidSymbols(account, copier, data)

            if (validatedSymbolData.is_valid_symbols) {
                // اگر نمادهای معاملاتی معتبر باشند

                data.symbol_a = validatedSymbolData.symbol_a
                data.symbol_b = validatedSymbolData.symbol_b

                //# بدست آوردن پارامتر های سفارش کپی
                const copyTradeData = await getCopyTradeParams(account, copier, data)

                //# مقداردهی سایر پارامترها برای ثبت دستور اجرا سفارش
                copyTradeData.handler = ACTION_HANDLER[copyTradeData.type]
                copyTradeData.status = 'pending'
                copyTradeData.origin_acc = account.acc
                copyTradeData.origin_ticket = data.ticket
                copyTradeData.ticket = copyTradeData.origin_new_ticket = ''
                copyTradeData.keyid = keyid++
                copyTradeData.open_price = data.open_price
                copyTradeData.description = validatedSymbolData.description
                copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)

                //# ثبت دستور اجرای سفارش
                await GetUpdateService.create(copyTradeData)
            }
            else {
                // اگر نمادهای معاملاتی نامعتبر باشند

                //# بستن معامله در اکانت ترید
                data.handler = ACTION_HANDLER.CLOSE_ORIGIN
                data.status = 'pending'
                data.acc = data.origin_acc = account.acc
                data.origin_ticket = data.ticket
                data.origin_new_ticket = ''
                data.description = validatedSymbolData.description
                data.keyid = keyid++
                data.message = await makeMsgForHandler(data.handler, data)
                await GetUpdateService.create(data)

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

        for (const order of data.partial_items) {
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
                copyTradeData.origin_new_ticket = order.open_ticket
                copyTradeData.description = []
                copyTradeData.vol = order.closed_vol //todo: calc vol - getOrderVol(account, copier, '', data.close_vol)

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
}

async function isDuplicatedOrder(data) {
    const is_duplicated = await GetUpdate.findOne({
        origin_acc: data.acc,
        origin_ticket: data.ticket,
        status: { $in: ['success', 'pending'] },
        handler: {
            $in: [
                ACTION_HANDLER.BUY,
                ACTION_HANDLER.BUYLIMIT,
                ACTION_HANDLER.BUYSTOP,
                ACTION_HANDLER.SELL,
                ACTION_HANDLER.SELLLIMIT,
                ACTION_HANDLER.SELLSTOP,
            ]
        }
    })

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
    data.type = info_parts[3]
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
        data.partial_items = partial_info.split(";")
            .map(side => side.split("@"))
            .map(([closed_ticket, closed_vol, closed_time, open_ticket, open_vol, open_time]) => ({ closed_ticket, closed_vol, closed_time, open_ticket, open_vol, open_time }))

        data.is_partial = data.partial_items.some(pi => pi.closed_ticket == data.ticket || pi.open_ticket == data.ticket)
    }

    return data
}
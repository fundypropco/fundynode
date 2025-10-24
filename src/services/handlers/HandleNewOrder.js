import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD, getCopyTradeParams, makeMsgForHandler, isOrderPossible, makeID } from '../../helpers/helper.js'
import { ACTION_HANDLER } from '../../helpers/constant.js'
import GetUpdate from '../../models/GetUpdate.js'

export default async (req, res) => {

    // 1.
    // پرداش پیام ورودی
    const data = processMessage(req.body.message)

    // 2. 
    // بررسی اینکه آیا این سفارش تکراری است یا خیر
    const is_duplicated = await GetUpdate.findOne({
        origin: `${data.acc}:${data.ticket}`,
        status: 'success',
        handler: {
            $in: [
                ACTION_HANDLER.BUYLIMIT,
                ACTION_HANDLER.BUYSTOP,
                ACTION_HANDLER.SELLLIMIT,
                ACTION_HANDLER.SELLSTOP,
            ]
        }
    })

    if (is_duplicated) {
        res.send({
            status: 'success',
            message: 'This order has already been received.',
        })
    }

    // 3.
    // پیدا کردن اکانت مربوط به عملیات دریافتی
    const account = await Account.findOne({ acc: data.acc });

    // 4.
    // بررسی اینکه آیا کپی ترید برای این اکانت فعال هست یا نه
    if (account.copy) {

        let keyid = makeID()

        // 5.
        // بدست آوردن اکانتهای کپی کننده
        for (const copier of account.copiers) {
            // 6.
            // بدست آوردن پارامتر های سفارش کپی
            let copyTradeData = await getCopyTradeParams(account, data, copier)

            // 7.
            // بررسی امکان اجرای سفارش کپی
            //todo: await کردن این بخش بعد از تکمیل
            copyTradeData.is_possible = isOrderPossible(copyTradeData)

            // 8.
            // مقداردهی سایر پارامترها برای ثبت دستور اجرا سفارش
            copyTradeData.handler = ACTION_HANDLER[copyTradeData.type]
            copyTradeData.status = copyTradeData.is_possible && copyTradeData.vol ? 'pending' : 'internal_error'
            copyTradeData.description = [
                !copyTradeData.is_possible ? "ORDER IS NOT POSSIBLE" : null,
                !copyTradeData.vol ? "ORDER VOL IS NOT VALID" : null
            ].filter(Boolean)
            copyTradeData.origin_acc = account.acc
            copyTradeData.origin_ticket = data.ticket
            copyTradeData.ticket = ''
            copyTradeData.origin_new_ticket = ''
            copyTradeData.keyid = keyid++
            copyTradeData.open_price = data.open_price
            copyTradeData.message = await makeMsgForHandler(copyTradeData.handler, copyTradeData)

            // 9.
            // ثبت دستور اجرای سفارش
            await GetUpdateService.create(copyTradeData)
        }
    }

    // 10.
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
    //E.g. 
    // 1006135456,500,NEW ORDER&324253368&BTCUSD&BUY&0.01&109245.51000&2025.09.27 18:05:14&0.00000&0.00000&-1.31000&0&,1758998114,-1
    // acc , 500 , NEW ORDER & ticket & symbol & type & vol & open_price & open_time & sl & tp & commission & magic & comment , timestamp , -1
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0]
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    const info = msg_parts[2]

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

    return data
}

const { Account } = require('../../models/Account')
const { RequestLog } = require("../../models/RequestLog")
const GetUpdateService = require("../../services/GetUpdateService")
const { formatDateYMD, getCopyTradeParams, makeMsgForHandler, isOrderPossible } = require('../../helpers/helper')
const { ACTION_HANDLER } = require('../../helpers/constant')

module.exports = async (req, res) => {

    const data = processMessage(req.body.message)

    // پیدا کردن اکانت مربوط به عملیات دریافتی
    const account = await Account.findOne({ acc: data.acc });

    // بررسی اینکه آیا کپی ترید برای این اکانت فعال هست یا نه
    if (account.copy) {
        // بدست آوردن اکانتهای کپی کننده
        for (const copier of account.copiers) {
            // بدست آوردن پارامتر های سفارش کپی
            let copyTradeData = await getCopyTradeParams(account, data, copier)

            // بررسی امکان اجرای سفارش کپی
            //todo: await کردن این بخش بعد از تکمیل
            copyTradeData.is_possible = isOrderPossible(copyTradeData)

            // مقداردهی سایر پارامترها برای ثبت دستور اجرا سفارش
            copyTradeData.handler = ACTION_HANDLER[copyTradeData.type]
            copyTradeData.status = copyTradeData.is_possible && copyTradeData.vol ? 'pending' : 'error'
            copyTradeData.message = makeMsgForHandler(copyTradeData.handler, copyTradeData)
            copyTradeData.description = [
                !copyTradeData.is_possible ? "ORDER IS NOT POSSIBLE" : null,
                !copyTradeData.vol ? "ORDER VOL IS NOT VALID" : null
            ].filter(Boolean)
            // ثبت دستور اجرای سفارش
            await GetUpdateService.create(copyTradeData)
        }
    }

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
    data.commision = info_parts[9]
    data.magic = info_parts[10]
    data.comment = info_parts[11]

    return data
}

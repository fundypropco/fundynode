import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateYMD, makeID } from '../../helpers/helper.js'
import TradeMap from '../../models/TradeMap.js'

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی 
    const data = processMessage(req.body.message)

    // #.
    // پیدا کردن اکانت مربوط به عملیات دریافتی 
    const account = await Account.findOne({ acc: data.acc });

    // #.
    // بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه 
    if (account.copy) {

        let keyid = makeID()

        for (const modifyInfo of data.items) {
            modifyInfo.keyid = keyid

            // #.
            // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر 
            const tradeMaps = await TradeMap.find({ acc_src: account.acc, ticket_src: modifyInfo.ticket, status: { $ne: 'deleted' } })

            // #.
            // بدست آوردن اکانتهای کپی کننده 
            for (const copier of account.copiers) {
                if (copier.copy) {
                    const tradeMap = tradeMaps.find(t => t.acc_dist == copier.acc)
                    const getUpdateData = await GetUpdateService.prepareModifyData(account, copier, modifyInfo, tradeMap)
                    await GetUpdateService.create(getUpdateData)
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
        .map(([ticket, sl, tp, open_price]) => ({ ticket, sl, tp, open_price }))

    return data
}

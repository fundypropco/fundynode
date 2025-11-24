import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { makeID } from '../../helpers/helper.js'
import TradeMap from '../../models/TradeMap.js'

export default async (req, res) => {

    // #.
    //پردازش پیام ورودی 
    const data = processMessage(req.body.message)

    if (!data.is_partial) {
        // اگر کلوز کامل باشد 
        await processClose(data)
    } else {
        // اگر پارشیال کلوز باشد 
        await processPartial(data)
    }

    // #.
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

async function processClose(data) {

    // #
    // پیدا کردن اکانت مربوط به عملیات دریافتی 
    const account = await Account.findOne({ acc: data.acc });

    // #.
    // بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه 
    if (account.copy) {

        let keyid = makeID()
        data.keyid = keyid

        // #.
        // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر 
        const tradeMaps = await TradeMap.find({ acc_src: account.acc, ticket_src: data.ticket })

        // #.
        // بدست آوردن اکانتهای کپی کننده 
        for (const copier of account.copiers) {
            if (copier.copy) {
                const tradeMap = tradeMaps.find(t => t.acc_dist == copier.acc)
                const getUpdateData = await GetUpdateService.prepareCloseData(account, copier, data, tradeMap)
                await GetUpdateService.create(getUpdateData)

                if (tradeMap) {
                    tradeMap.close_time_src = data.closed_time
                    tradeMap.close_price_src = data.closed_price
                    await tradeMap.save()
                }
            }
        }
    }
}

async function processPartial(data) {

    // #.
    // پیدا کردن اکانت مربوط به عملیات دریافتی 
    const account = await Account.findOne({ acc: data.acc });

    // #.
    // بررسی اینکه آیا قابلیت برای این اکانت فعال هست یا نه 
    if (account.copy) {

        let keyid = makeID()
        const partialInfo = data.partial_item
        partialInfo.keyid = keyid
        partialInfo.closed_price = data.closed_price

        // #.
        // بدست آوردن تیکتهای متناظر با این سفارش روی اکانتهای دیگر 
        const tradeMaps = await TradeMap.find({ acc_src: account.acc, ticket_src: partialInfo.closed_ticket })

        // #.
        // بدست آوردن اکانتهای کپی کننده 
        for (const copier of account.copiers) {
            if (copier.copy) {
                const tradeMap = tradeMaps.find(t => t.acc_dist == copier.acc)
                const getUpdateData = await GetUpdateService.preparePartialCloseData(account, copier, partialInfo, tradeMap)
                await GetUpdateService.create(getUpdateData)

                if (tradeMap) {
                    tradeMap.close_time_src = partialInfo.closed_time
                    tradeMap.close_price_src = partialInfo.closed_price
                    await tradeMap.save()
                }
            }
        }
    }
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,501,NEW CLOSE&324253369&115608&2025-10-14 15:23:40&1@324253369&115608&2025-10-14 15:23:40&1,1758998127,-1
    // acc , 501 , NEW CLOSE & ticket & close-price & close-time & vol @ ticket & close-price & close-time & vol @ close-price & close-time & vol @ ticket & close-price & close-time & vol , timestamp, -1
    // partial → acc , 501 , NEW CLOSE_or_DELETE & ticket & close-price & close-time & vol @ ticket & close-price & close-time & vol , timestamp, CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME ; CLOSED_TICKET @ CLOSED_VOL @ CLOSED_TIME @ OPEN_TICKET @ OPEN_VOL @ OPEN_TIME
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].replace(/_.*/, '')
    data.timestamp = msg_parts[3] * 1000
    let info = msg_parts[2]
    const partial_info = msg_parts[4]
    data.is_partial = false

    // msg info
    const info_parts = info.split('&')
    data.closed_ticket = info_parts[1]
    data.closed_price = info_parts[2]
    data.closed_time = info_parts[3]
    data.closed_vol = info_parts[4]

    if (partial_info != -1) {
        // partial
        data.partial_item = partial_info.split(";")
            .map(side => side.split("@"))
            .map(([closed_ticket, closed_vol, closed_time, open_ticket, open_vol, open_time]) => ({ closed_ticket, closed_vol, closed_time, open_ticket, open_vol, open_time }))
            .find(pi => pi.closed_ticket == data.ticket)

        data.is_partial = !!data.partial_item
    }

    return data
}

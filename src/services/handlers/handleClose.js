import Account from '../../models/Account.js'
import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDate, getOrderSide, makeID } from '../../helpers/helper.js'
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
        const tradeMaps = await TradeMap.find({ acc_src: account.acc, ticket_src: data.closed_ticket, status: { $ne: 'deleted' } })

        // #.
        // بدست آوردن اکانتهای کپی کننده 
        for (const copier of account.copiers) {
            if (copier.copy) {
                const tradeMap = tradeMaps.find(t => t.acc_dist == copier.acc)
                const getUpdateData = await GetUpdateService.prepareCloseData(account, copier, data, tradeMap)
                await GetUpdateService.create(getUpdateData)

                if (tradeMap) {
                    tradeMap.close_time_src = formatDate(data.closed_timestamp)
                    tradeMap.close_timestamp_src = data.closed_timestamp
                    tradeMap.close_time_utc_src = data.closed_timestamp
                    tradeMap.close_price_src = data.closed_price
                    tradeMap.commission_src = data.commission
                    tradeMap.swap_src = data.swap
                    tradeMap.profit_src = data.profit
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
        const tradeMaps = await TradeMap.find({ acc_src: account.acc, ticket_src: partialInfo.closed_ticket, status: { $ne: 'deleted' } })

        // #.
        // بدست آوردن اکانتهای کپی کننده 
        for (const copier of account.copiers) {
            if (copier.copy) {
                const tradeMap = tradeMaps.find(t => t.acc_dist == copier.acc)
                const getUpdateData = await GetUpdateService.preparePartialCloseData(account, copier, partialInfo, tradeMap)
                await GetUpdateService.create(getUpdateData)

                if (tradeMap) {
                    tradeMap.close_time_src = formatDate(partialInfo.closed_timestamp)
                    tradeMap.close_timestamp_src = partialInfo.closed_timestamp
                    tradeMap.close_time_utc_src = partialInfo.closed_timestamp
                    tradeMap.close_price_src = partialInfo.closed_price
                    tradeMap.commission_src = partialInfo.commission
                    tradeMap.swap_src = partialInfo.swap
                    tradeMap.profit_src = partialInfo.profit
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
    data.closed_price = Number(info_parts[2])
    data.closed_timestamp = info_parts[3] * 1000
    data.symbol = info_parts[4]
    data.side = getOrderSide(info_parts[5])
    data.closed_vol = Number(info_parts[6])
    data.swap = Number(info_parts[7])
    data.commission = Number(info_parts[8])
    data.profit = Number(info_parts[9])
    data.magic = Number(info_parts[10])

    if (partial_info != -1) {
        // partial
        data.partial_item = partial_info.trim().split("@").filter(Boolean)
            .map(side => side.split("&"))
            .map(([
                closed_ticket,
                closed_vol,
                closed_price,
                closed_timestamp,
                swap,
                commission,
                profit,
                open_ticket,
                open_vol,
                open_timestamp
            ]) => ({
                closed_ticket,
                closed_vol: Number(closed_vol),
                closed_price: Number(closed_price),
                closed_timestamp: closed_timestamp * 1000,
                swap: Number(swap),
                commission: Number(commission),
                profit: Number(profit),
                open_ticket,
                open_vol: Number(open_vol),
                open_timestamp: open_timestamp * 1000
            }))
            .find(pi => pi.closed_ticket == data.ticket)

        data.is_partial = !!data.partial_item
    }

    return data
}

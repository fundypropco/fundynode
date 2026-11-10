import { formatDateUTC } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeMap from "../../models/TradeMap.js"
import { getBrokerData } from "../../boot/cache.js"
import { brokerKeyOf } from "../../helpers/brokerKey.js"
import AccountService from "../AccountService.js"

export default async (req, res) => {

    // #. 
    // پردازش دیتای ورودی 
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات 
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    //#
    // بستن مپ معامله کلوز شده 
    if (getUpdateDoc && getUpdateDoc.status === 'success') {

        const brokerData = await getBrokerData(brokerKeyOf(getUpdateDoc))
        const diff_time = Number(brokerData.diff_time)

        for (const item of data.items) {
            // #. 
            // پیدا کردن تریدهای مرتبط با این ترید
            // اگر روی متاتریدر 5 پارشیال شده باشد چند رکورد با تیکت یکسان داریم و کمیسیون تجمیعی است
            const tradeMaps = await TradeMap.find({ acc_dist: data.acc, ticket_dist: item.ticket })

            // #.
            // محاسبه کمیسیون های تجمیعی لحاظ شده برای این معامله تا کنون
            const sumCommissions = tradeMaps.reduce((s, t) => s + (t.commission_dist ?? 0), 0)

            // #.
            // اگر مقدار کمیسیون گزارش شده از کمیسیون های تجمیعی بیشتر باشد
            let commission_dist = 0
            if (item.commission < sumCommissions) {
                commission_dist = Math.round((item.commission - sumCommissions) * 100) / 100
            }

            // #. 
            // پیدا کردن معامله باز جهت ثبت اطلاعات و تغییر وضعیت به بسته شده
            const openTradeMap = tradeMaps.find(t => t.status === 'open')
            if (openTradeMap) {
                openTradeMap.close_price_dist = item.closed_price
                openTradeMap.close_time_dist = formatDateUTC(item.closed_timestamp + diff_time)
                openTradeMap.close_timestamp_dist = item.closed_timestamp + diff_time
                openTradeMap.profit_dist = item.profit
                openTradeMap.swap_dist = item.swap
                openTradeMap.status = 'closed'
                openTradeMap.closing_type = 'magic'
                if (commission_dist) {
                    if (tradeMaps.length === 1) {
                        openTradeMap.commission_dist = item.commission
                    } else if (tradeMaps.length > 1) {
                        openTradeMap.commission_dist += commission_dist
                    }
                }
                await openTradeMap.save()
            }

            // #.
            // ثبت اطلاعات مالی در بالانس 
            // const profit_bl = Math.round((item.profit + item.swap + commission_dist) * 100) / 100
            // await AccountService.updateProfitBl(getUpdateDoc.origin_acc, data.acc, profit_bl, false)
        }
    }

    // #. 
    // ارسال پاسخ عملیات موفقیت آمیز 
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456 , 974 , ticket_1 & close_price_1 & close_timestamp_1 & swap_1 & commision_1 & profit_1 @ ticket_2 & close_price_2 & close_timestamp_2 & swap_2 & commision_2 & profit_2 @ ... @ , 1758983673 , id
    // 1006135456 , 974 , NO OPEN TRADES FIND , 1758983673 , id
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].split('_')[0])
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = Number(msg_parts[3])
    data.date = formatDateUTC(data.timestamp)
    data.keyid = Number(msg_parts[4])
    const info = msg_parts[2].toLowerCase()

    // msg info
    data.items = []
    if (!info.includes("no open trades")) {
        data.items = info.split("_@_")
            .map(part => part.trim())
            .filter(part => part.length > 0)
            .map(part => part.split("_&_").map(x => x.trim()))
            .map(([ticket, closed_price, closed_timestamp, swap, commission, profit]) => ({
                ticket: Number(ticket),
                closed_price: Number(closed_price),
                closed_timestamp: Number(closed_timestamp),
                swap: Number(swap),
                commission: Number(commission),
                profit: Number(profit),
                vol: Number(vol),
                symbol: symbol
            }))
    }

    data.status = 'success'

    return data
}

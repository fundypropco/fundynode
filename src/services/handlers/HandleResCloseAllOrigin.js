import RequestLog from "../../models/RequestLog.js"
import { formatDateUTC } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeMap from "../../models/TradeMap.js"
import { getBrokerData } from "../../boot/cache.js"

export default async (req, res) => {

    // #. 
    // پردازش دیتای ورودی 
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات 
    const getUpdateDoc = await GetUpdateService.updateStatus(data)
    const brokerData = await getBrokerData(getUpdateDoc?.server)
    const diff_time = Number(brokerData?.diff_time || 0)

    // #.
    // ثبت اطلاعات مالی اکانت ترید 
    for (const item of data.items) {

        // #. 
        // پیدا کردن تریدهای مرتبط با این ترید
        // اگر روی متاتریدر 5 پارشیال شده باشد چند رکورد با تیکت یکسان داریم و کمیسیون تجمیعی است
        const tradeMaps = await TradeMap.find({
            acc_src: data.acc,
            ticket_src: item.ticket,
        }).sort({ created_at: -1 })

        // #.
        // بدست آوردن آخرین ترید از مجموعه
        const latestTradeMap = tradeMaps[0]

        // #.
        // محاسبه کمیسیون های تجمیعی لحاظ شده برای این معامله تا کنون
        const sumCommissions = tradeMaps.reduce((s, t) => s + (t.commission_dist ?? 0), 0)

        // #.
        // اگر مقدار کمیسیون گزارش شده از کمیسیون های تجمیعی بیشتر باشد
        // بیشتر بودن در کمیسیون به معادل منفی تر بودن هست
        let commission_src = 0
        if (item.commission < sumCommissions) {
            commission_src = Math.round((item.commission - sumCommissions) * 100) / 100
        }

        // #. 
        // پیدا کردن معامله جهت ثبت اطلاعات و تغییر وضعیت به بسته شده
        if (latestTradeMap) {
            latestTradeMap.close_price_src = item.closed_price
            latestTradeMap.close_time_src = formatDateUTC(item.closed_timestamp + diff_time)
            latestTradeMap.close_timestamp_src = item.closed_timestamp + diff_time
            latestTradeMap.profit_src = item.profit
            latestTradeMap.swap_src = item.swap
            if (commission_src) {
                if (tradeMaps.length === 1) {
                    latestTradeMap.commission_src = item.commission
                } else if (tradeMaps.length > 1) {
                    latestTradeMap.commission_src += commission_src
                }
            }
            await latestTradeMap.save()
        }
    }

    // #.
    // لاگ گرفتن از رکوئست دریافتی 
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
        message: req.body.message,
        datetime: Date.now()
    })
    await requestLog.save()

    // #. 
    // ارسال پاسخ عملیات موفقیت آمیز 
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456 , 980 , ticket_1 & close_price_1 & close_timestamp_1 & swap_1 & commision_1 & profit_1 @ ticket_2 & close_price_2 & close_timestamp_2 & swap_2 & commision_2 & profit_2 @ ...@ , 1758983673 , id
    // 1006135456 , 980 , NO OPEN TRADES FIND , 1727109056 , id
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].split('_')[0])
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = Number(msg_parts[3])
    data.keyid = Number(msg_parts[4])
    data.status = 'success'
    const info = msg_parts[2].toLowerCase()

    // msg info
    data.items = []
    if (!info.includes("no open trades")) {
        data.items = info.split("@")
            .map(part => part.trim())
            .filter(part => part.length > 0)
            .map(part => part.split("&").map(x => x.trim()))
            .map(([ticket, closed_price, closed_timestamp, swap, commission, profit, vol, symbol]) => ({
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

    return data
}

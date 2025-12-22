import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from "../GetUpdateService.js"
import { formatDateUTC, makeID, makeMsgForHandler } from '../../helpers/helper.js'
import { ACTION_HANDLER } from "../../helpers/constant.js"
import TradeMap from "../../models/TradeMap.js"
import { getBrokerData } from "../../boot/cache.js"
import AccountService from "../AccountService.js"

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    // #.
    // بروزرسانی وضعیت دستور در صف دستورات
    const getUpdateDoc = await GetUpdateService.updateStatus(data)
    const brokerData = await getBrokerData(getUpdateDoc?.server)
    const diff_time = Number(brokerData?.diff_time || 0)

    // #
    // بررسی نتیجه بسته شدن تک تک تیکتها 
    // ارسال دستور بستن مجدد در صورت وجود خطا 
    // تغییر وضعیت ترید به بسته شده در صورت موفق بودن 
    for (const item of data.items) {
        let keyid = makeID()
        if (item.status === 'success') {
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
                openTradeMap.closing_type = 'bulk'
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
            const profit_bl = Math.round((item.profit + item.swap + commission_dist) * 100) / 100
            await AccountService.updateProfitBl(getUpdateDoc.origin_acc, data.acc, profit_bl, false)
        } else {
            const order = {
                handler: ACTION_HANDLER.CLOSE,
                acc: data.acc,
                server: getUpdateDoc.server,
                origin_acc: getUpdateDoc.origin_acc,
                origin_server: getUpdateDoc.origin_server,
                ticket: item.ticket,
                symbol: item.symbol,
                vol: item.vol,
                keyid: keyid++
            }
            order.message = await makeMsgForHandler(order.handler, order)
            await GetUpdateService.create(order)
        }
    }

    // 6.
    // لاگ گرفتن از رکوئست دریافتی
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
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
    // 1006135456 , 979 , OK & ticket & close_price & close_timestamp & swap & commision & profit & error , 1758983673 , id
    // 1006135456 , 987 , FAIL & ticket & error , 1758983673 , id
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = Number(msg_parts[3])
    data.date = formatDateUTC(data.timestamp)
    let info = msg_parts[2].trim()
    data.keyid = msg_parts[4]

    // msg info
    data.items = info.split("_@_")
        .map(part => part.trim())
        .filter(part => part.length > 0)
        .map(part => part.split("_&_").map(x => x.trim()))
        .map(item => {
            const status = (item[0]?.trim().toLowerCase() === 'ok') ? 'success' : 'error'
            if (status === 'success') {
                return {
                    status,
                    ticket: Number(item[1]),
                    closed_price: Number(item[2] || 0),
                    closed_timestamp: Number(item[3]),
                    swap: Number(item[4] || 0),
                    commission: Number(item[5] || 0),
                    profit: Number(item[6] || 0),
                    error: item[7] || null,
                    vol: Number(item[8]),
                    symbol: item[9]
                }
            } else {
                return {
                    status,
                    ticket: Number(item[1]),
                    error: item[2] || null
                }
            }
        })

    return data
}

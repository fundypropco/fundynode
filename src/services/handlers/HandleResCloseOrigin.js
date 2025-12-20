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

    // #.
    // بستن مپ معامله کلوز شده 
    if (getUpdateDoc && getUpdateDoc.status === 'success') {
        // #.
        // دریافت اطلاعات بروکر
        const brokerData = await getBrokerData(getUpdateDoc.server)
        const diff_time = Number(brokerData.diff_time)

        // #. 
        // پیدا کردن تریدهای مرتبط با این ترید
        // اگر روی متاتریدر 5 پارشیال شده باشد چند رکورد با تیکت یکسان داریم و کمیسیون تجمیعی است
        const tradeMaps = await TradeMap.find({
            acc_src: data.acc,
            ticket_src: data.ticket,
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
        if (data.commission < sumCommissions) {
            commission_src = Math.round((data.commission - sumCommissions) * 100) / 100
        }

        // #. 
        // پیدا کردن معامله جهت ثبت اطلاعات و تغییر وضعیت به بسته شده
        if (latestTradeMap) {
            latestTradeMap.close_price_src = data.closed_price
            latestTradeMap.close_time_src = formatDateUTC(data.closed_timestamp + diff_time)
            latestTradeMap.close_timestamp_src = data.closed_timestamp + diff_time
            latestTradeMap.profit_src = data.profit
            latestTradeMap.swap_src = data.swap
            if (commission_src) {
                if (tradeMaps.length === 1) {
                    latestTradeMap.commission_src = data.commission
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
    const data = {}

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].split('_')[0])
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = Number(msg_parts[3])
    data.keyid = Number(msg_parts[4])
    const info = msg_parts[2]

    // msg info
    const info_parts = info.split('&')
    data.result_text = info_parts[0]
    data.result_code = 0
    data.profit = 0
    data.swap = 0
    data.commission = 0
    data.ticket = ''

    if (data.result_text.toLowerCase().includes('ok')) {
        data.status = 'success'
        data.ticket = info_parts[1]
        if (data.result_text.toLowerCase().includes('close')) {
            data.closed_price = Number(info_parts[2])
            data.closed_timestamp = Number(info_parts[3])
            data.swap = Number(info_parts[4])
            data.commission = Number(info_parts[5])
            data.profit = Number(info_parts[6])
            data.error = info_parts[7]
            data.vol = Number(info_parts[8])
            data.symbol = info_parts[9]
        }
        else if (data.result_text.toLowerCase().includes('delete')) {
            data.closed_timestamp = Number(info_parts[2])
        }
    } else {
        data.status = 'error'
        data.result_code = info_parts[2]
    }

    return data
}

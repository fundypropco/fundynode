import { formatDateUTC } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeMap from "../../models/TradeMap.js"
import { getBrokerData } from "../../boot/cache.js"
import AccountService from "../AccountService.js"
import TradeMapService from "../TradeMapService.js"

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
        // کوئری فقط در سمت مقصد زده میشود چون ممکن است تریدر متا 4 داشته باشد و تیکتهای متقاوت در اثر پارشیال
        const tradeMaps = await TradeMap.find({
            acc_dist: data.acc,
            ticket_dist: data.ticket,
        })

        // #.
        // محاسبه کمیسیون های تجمیعی لحاظ شده برای این معامله تا کنون
        const sumCommissions = tradeMaps.reduce((s, t) => s + (t.commission_dist ?? 0), 0)
        const sumCommissionsFinal = tradeMaps.reduce((s, t) => s + (t.commission_final ?? 0), 0)

        // #.
        // اگر مقدار کمیسیون گزارش شده از کمیسیون های تجمیعی بیشتر باشد
        // در کمیسیون منفی تر بودن یعنی بیشتر بود
        let commission_dist = 0
        if (data.commission < sumCommissions) {
            commission_dist = Math.round((data.commission - sumCommissions) * 100) / 100
        }

        let commission_final = 0
        if (data.commission_final < sumCommissionsFinal) {
            commission_final = Math.round((data.commission_final - sumCommissionsFinal) * 100) / 100
        }

        // #. 
        // پیدا کردن معامله باز جهت ثبت اطلاعات و تغییر وضعیت به بسته شده
        const openTradeMap = tradeMaps.find(t => t.status === 'open')
        if (openTradeMap) {
            openTradeMap.close_price_dist = data.closed_price
            openTradeMap.close_time_dist = formatDateUTC(data.closed_timestamp + diff_time)
            openTradeMap.close_timestamp_dist = data.closed_timestamp + diff_time
            openTradeMap.profit_dist = data.profit
            openTradeMap.swap_dist = data.swap
            openTradeMap.swap_final = data.swap_final
            openTradeMap.status = 'closed'
            openTradeMap.closing_type = 'single'
            if (commission_dist) {
                if (tradeMaps.length === 1) {
                    openTradeMap.commission_dist = data.commission
                } else if (tradeMaps.length > 1) {
                    openTradeMap.commission_dist += commission_dist
                }
            }
            if (commission_final) {
                if (tradeMaps.length === 1) {
                    openTradeMap.commission_final = data.commission_final
                } else if (tradeMaps.length > 1) {
                    openTradeMap.commission_final += commission_final
                }
            }
            await openTradeMap.save()

            await TradeMapService.sync({
                event: "closed",
                data: [openTradeMap.toObject()]
            })
        }

        // #.
        // ثبت اطلاعات مالی در بالانس و بررسی دراودان 
        // const profit_bl = Math.round((data.profit + data.swap + commission_dist) * 100) / 100
        // await AccountService.updateProfitBl(getUpdateDoc.origin_acc, data.acc, profit_bl)

    }

    // #. 
    // ارسال پاسخ عملیات موفقیت آمیز 
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,996,OK CLOSE&324252647&0,1758987838,7
    // acc , 996 , OK/FAIL CLOSE & ticket & result_code , timestamp , keyid
    // acc , 991 , OK/FAIL DELETE & ticket & result_code , timestamp , keyid
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = Number(msg_parts[0].split('_')[0])
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = Number(msg_parts[3])
    data.keyid = Number(msg_parts[4])
    const info = msg_parts[2]

    // msg info
    const info_parts = info.split('_&_')
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
            data.swap_final = Number(info_parts[5])
            data.commission = Number(info_parts[6])
            data.commission_final = Number(info_parts[7])
            data.profit = Number(info_parts[8])
            data.error = info_parts[9]
            data.vol = Number(info_parts[10])
            data.symbol = info_parts[11]
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

import RequestLog from "../../models/RequestLog.js"
import { formatDateUTC } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeMap from "../../models/TradeMap.js"
import Account from "../../models/Account.js"
import { getBrokerData } from "../../boot/cache.js"
import AccountService from "../AccountService.js"

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
        const brokerData = await getBrokerData(getUpdateDoc.server)
        const diff_time = Number(brokerData.diff_time)

        const symbol = await Symbol.findOne({ server: getUpdateDoc.server, symbol: data.symbol })
        const commission_dist = Math.round(symbol.commission_max * (data.vol / symbol.vol_min) * 100) / 100

        await TradeMap.updateMany(
            {
                acc_src: getUpdateDoc.origin_acc,
                ticket_src: getUpdateDoc.origin_ticket,
                acc_dist: data.acc,
                ticket_dist: data.ticket,
            },
            [
                {
                    $set: {
                        status: {
                            $switch: {
                                branches: [
                                    { case: { $eq: ["$status", "open"] }, then: "closed" },
                                    { case: { $eq: ["$status", "pending"] }, then: "canceled" }
                                ],
                                default: "$status"
                            }
                        },
                        close_price_dist: data.closed_price ?? 0,
                        close_time_dist: formatDateUTC(data.closed_timestamp + diff_time),
                        close_timestamp_dist: data.closed_timestamp + diff_time,
                        swap_dist: data.swap,
                        commission_dist: commission_dist,
                        profit_dist: data.profit,
                        closing_type: 'single',
                    }
                }
            ]
        )

        // #.
        // ثبت اطلاعات مالی در بالانس 
        const total_closed_profit = Number((data.profit + data.swap + data.commission).toFixed(2))
        const updatedAccount = await Account.findOneAndUpdate(
            { acc: getUpdateDoc.origin_acc, "copiers.acc": data.acc },
            { $inc: { "copiers.$.profit_bl": total_closed_profit } },
            { new: true }
        )
        const updatedCopier = updatedAccount.copiers.find(c => c.acc == data.acc)

        // #.
        // بررسی دراودان حساب 
        if (updatedAccount.copy && (updatedAccount.initial + updatedCopier.profit_bl <= updatedAccount.drawdown)) {
            await AccountService.bulkClose(updatedAccount)
            updatedAccount.copy = false
            await updatedAccount.save()
            await new Promise(resolve => setTimeout(resolve, 3000))
            await AccountService.closeAll(updatedAccount)
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

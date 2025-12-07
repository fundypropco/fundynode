import RequestLog from "../../models/RequestLog.js"
import { formatDate } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'
import TradeMap from "../../models/TradeMap.js"
import Account from "../../models/Account.js"

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
        await TradeMap.updateMany(
            {
                acc_src: data.acc,
                ticket_src: data.ticket,
            },
            [
                {
                    $set: {
                        close_price_src: data.closed_price ?? 0,
                        close_time_src: formatDate(data.closed_timestamp),
                        close_timestamp_src: data.closed_timestamp,
                        swap_src: data.swap,
                        commission_src: data.commission,
                        profit_src: data.profit
                    }
                }
            ]
        )
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
    data.acc = msg_parts[0].split('_')[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3]
    data.keyid = msg_parts[4]
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
            data.closed_timestamp = info_parts[3]
            data.swap = Number(info_parts[4])
            data.commission = Number(info_parts[5])
            data.profit = Number(info_parts[6])
        }
        else if (data.result_text.toLowerCase().includes('delete')) {
            data.closed_timestamp = info_parts[2]
        }
    } else {
        data.status = 'error'
        data.result_code = info_parts[2]
    }

    return data
}

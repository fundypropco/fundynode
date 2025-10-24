import RequestLog from "../../models/RequestLog.js"
import { formatDateYMD } from '../../helpers/helper.js'
import GetUpdateService from '../GetUpdateService.js'

export default async (req, res) => {

    // 1. 
    // پردازش دیتای ورودی
    const data = processMessage(req.body.message)

    // 2.
    // بروزرسانی وضعیت دستور در صف دستورات
    const getUpdateDoc = await GetUpdateService.updateStatus(data)

    // 3.
    // لاگ گرفتن از رکوئست دریافتی
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
        message: req.body.message,
        datetime: Date.now()
    })
    await requestLog.save()

    // 4. 
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
    data.acc = msg_parts[0]
    data.handler = 1000 - parseInt(msg_parts[1])
    data.timestamp = msg_parts[3] * 1000
    data.date = formatDateYMD(data.timestamp)
    data.keyid = msg_parts[4]
    const info = msg_parts[2]

    // msg info
    const info_parts = info.split('&')
    data.result_text = info_parts[0]
    data.ticket = info_parts[1]
    data.result_code = info_parts[2]
    data.status = data.result_code == 0 ? 'success' : 'error'

    return data
}

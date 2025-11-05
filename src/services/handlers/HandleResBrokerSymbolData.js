import RequestLog from "../../models/RequestLog.js"
import GetUpdateService from '../GetUpdateService.js'
import Symbol from "../../models/Symbol.js"
import GetUpdate from "../../models/GetUpdate.js"

export default async (req, res) => {

    //# پردازش دیتای ورودی
    const data = processMessage(req.body.message)

    //# بروزرسانی وضعیت دستور در صف دستورات
    await GetUpdateService.updateStatus(data)

    //# بدست آوردن نام سرور
    const getUpdateDoc = await GetUpdate.findOne({
        acc: data.acc,
        handler: data.handler,
        keyid: data.keyid,
    })

    if (getUpdateDoc) {
        //# 
        // بروزرسانی اطلاعات نماد
        const symbol = await Symbol.findOne({ symbol: getUpdateDoc.symbol, server: getUpdateDoc.server })

        if (symbol) {
            symbol.contract_size = data.symbol_info.contract_size
            symbol.tick_size = data.symbol_info.tick_size
            symbol.tick_value = data.symbol_info.tick_value
            symbol.vol_step = data.symbol_info.vol_step
            symbol.vol_min = data.symbol_info.vol_min
            symbol.vol_max = data.symbol_info.vol_max
            symbol.digits = data.symbol_info.digits
            symbol.point = data.symbol_info.point
            await symbol.save();
        }
    }

    //# لاگ گرفتن از رکوئست دریافتی
    const requestLog = new RequestLog({
        type: 'GetUpdateResponse',
        message: req.body.message,
        datetime: Date.now()
    })
    await requestLog.save()

    //# ارسال پاسخ عملیات موفقیت آمیز
    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g. 
    // 1006135456,989,cmpny=LiteFinance Global LLC&name=saeed zarei mohammadAbad&server=LiteFinanceVC-Demo&leverage=500,1758992092,21
    // acc , 989 , k1=v1 & k2=v2 , timestamp , keyid
    const data = {};

    // msg parts
    const msg_parts = msg.split(',')
    data.acc = msg_parts[0].replace(/_.*/, '')
    data.handler = 1000 - parseInt(msg_parts[1])
    data.status = 'success'
    data.result_text = 'success'
    data.code = 0
    data.keyid = msg_parts[msg_parts.length - 1]
    const info = msg_parts[2]
    data.symbol_info = Object.fromEntries(
        info.split("&").map(part => part.split("="))
    )
    return data
}

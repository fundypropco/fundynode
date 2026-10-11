import AccReportService from '../AccReportService.js'

// #.
// گزارشی که بیش از این مقدار از زمانش گذشته باشد دیگر لحظه ای نیست و ذخیره نمیشود
const MAX_REPORT_DELAY_MS = 10_000

export default async (req, res) => {

    // #.
    // پردازش پیام ورودی
    const data = processMessage(req.body.message)

    if (!data) {
        return res.send({
            status: 'error',
            message: 'Wrong Message Format!!!'
        })
    }

    // #.
    // گزارش قدیمی بی استفاده است
    if (Date.now() - data.timestamp > MAX_REPORT_DELAY_MS) {
        return res.send({
            status: 'error',
            message: 'Stale Report!!!'
        })
    }

    // #.
    // ذخیره آخرین وضعیت حساب در ردیس (فقط اگر از گزارش موجود جدیدتر باشد)
    await AccReportService.save(data)

    res.send({
        status: 'success',
    })
}

function processMessage(msg) {
    // E.g.
    // 1006135456_342_1 , 42 , X0_&_X1_&_X2_&_X3_&_X4_&_X5_&_X6_&_X7_&_... , 1758983673123 , -2
    // master_acc _ magic(trader acc) _ cluster , 42 , ... & free_margin(X4) & used_margin(X5) & equity(X6) & balance(X7) & open_trades(X8) & closed_trades(X9) & ... , timestamp_ms , -2
    const msg_parts = msg.split(',')
    const acc_parts = msg_parts[0].split('_')
    const info_parts = (msg_parts[2] || '').split('_&_')

    const data = {
        acc: Number(acc_parts[1]),
        master_acc: Number(acc_parts[0]),
        // #.
        // مارجین‌ها برای isOrderPossible در ردیس می‌مانند (به پنل فرستاده نمی‌شوند)
        free_margin: Number(info_parts[4]),
        used_margin: Number(info_parts[5]),
        equity: Number(info_parts[6]),
        balance: Number(info_parts[7]),
        // #.
        // تعداد معاملات باز و بسته حساب Master ؛ EA قدیمی ندارد ⇒ null (گزارش به خاطر آنها رد نمی‌شود)
        open_trades: toCount(info_parts[8]),
        closed_trades: toCount(info_parts[9]),
        timestamp: Number(msg_parts[3]),
        received_at: Date.now(),
    }

    // #.
    // همه مقادیر باید عدد معتبر باشند
    const isValid = data.acc > 0
        && info_parts.length >= 8
        && [data.free_margin, data.used_margin, data.equity, data.balance, data.timestamp].every(Number.isFinite)

    return isValid ? data : null
}

function toCount(value) {
    if (value === undefined || String(value).trim() === '') return null
    const n = Number(value)
    return Number.isInteger(n) && n >= 0 ? n : null
}

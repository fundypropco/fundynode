import Broker from "../models/Broker.js"

// #.
// کلید بروکر (درخواست صاحب پروژه 2026-11-11 ؛ پنل FundyPanel منبع بروکرهاست)
// - broker_key یکتا = نام سرور با یک عبارت توضیحی (مثل LiteFinance-MT5-Demo-ECN) ؛ چند کلاس حساب یک سرور دارند ⇒ server یکتا نیست
// - نمادها ، حساب ها (سطح اول = User MT) ، copier ها (Master) ، TradeMap و GetUpdate با broker_key به بروکر می رسند
// - acc بروکر (حساب اطلاعات ، یکتا) فقط برای درخواست اطلاعات از EA (دستورهای 13 / 11) و پیدا کردن بروکر از پیام EA (401) است
// رکورد قدیمی بدون broker_key ⇒ همان server (مهاجرت boot/migrateBrokerKey.js برای بروکرها broker_key = server گذاشت)

// #. doc = Account / copier / Symbol / GetUpdate ؛ suffix = '_src' | '_dist' برای TradeMap
export function brokerKeyOf(doc, suffix = '') {
    if (!doc) return ''
    return String(doc['broker_key' + suffix] || doc['server' + suffix] || '')
}

// #. حساب مبدا GetUpdate (origin_broker_key ، قدیمی origin_server)
export function originBrokerKeyOf(doc) {
    if (!doc) return ''
    return String(doc.origin_broker_key || doc.origin_server || '')
}

// #.
// بروکر از روی شماره حساب اطلاعات (acc) پیامی که از EA رسیده (401 ، پاسخ 13 / 11) ؛ EA از broker_key خبر ندارد
// fallbackKey (اختیاری) = broker_key دستوری که پاسخش رسیده (اگر ادمین بین درخواست و پاسخ acc را عوض کرده باشد)
export async function brokerByAcc(acc, fallbackKey = '') {
    const num = Number(String(acc ?? '').split('_')[0])
    let broker = Number.isFinite(num) && num > 0 ? await Broker.findOne({ acc: num }).lean() : null
    if (!broker && fallbackKey) {
        broker = await Broker.findOne({ broker_key: String(fallbackKey) }).lean()
    }
    return broker
}

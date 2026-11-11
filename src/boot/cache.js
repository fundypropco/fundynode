import Broker from "../models/Broker.js"
import LogRule from "../models/LogRule.js"

let brokersData = null
let brokersData_expire = null

let logRulesData = null
let logRulesData_expire = null


// #. diff_time بروکر با کلید broker_key (2026-11-11 ؛ قبلا server) ؛ ورودی از brokerKeyOf(doc)
export async function getBrokerData(brokerKey) {
    const now = Date.now()

    if (brokersData && brokersData[brokerKey] && now < brokersData_expire) {
        return brokersData[brokerKey]
    }

    const brokers = await Broker.find().lean()

    brokersData = brokers.reduce((t, b) => {
        t[b.broker_key || b.server] = {
            diff_time: b.diff_time
        }
        return t
    }, {})

    brokersData_expire = now + (5 * 60 * 1000)

    return brokersData[brokerKey]
}

// #. بعد از ساخت / ویرایش / حذف بروکر از پنل (BrokerSymbolService) کش بروکرها همان لحظه باطل می‌شود
export function clearBrokerCache() {
    brokersData = null
    brokersData_expire = null
}

export async function getLogRuleData(handler) {

    // #.
    // اعتبار کش فقط به زمان انقضا وابسته است؛ در غیر این صورت برای handler هایی که LogRule ندارند (مثل 42 که هر ثانیه می آید) هر بار از دیتابیس خوانده میشد
    if (logRulesData && logRulesData_expire && Date.now() < logRulesData_expire) {
        return logRulesData[handler] || false
    }

    const logRules = await LogRule.find().lean()

    logRulesData = logRules.reduce((t, lr) => {
        t[lr.handler] = lr.log
        return t
    }, {})


    logRulesData_expire = Date.now() + (60 * 1000)

    return logRulesData[handler] || false
}


import Broker from "../models/Broker.js"
import LogRule from "../models/LogRule.js"

let brokersData = null
let brokersData_expire = null

let logRulesData = null
let logRulesData_expire = null


export async function getBrokerData(server) {
    const now = Date.now()

    if (brokersData && brokersData[server] && now < brokersData_expire) {
        return brokersData[server]
    }

    const brokers = await Broker.find().lean()

    brokersData = brokers.reduce((t, b) => {
        t[b.server] = {
            diff_time: b.diff_time
        }
        return t
    }, {})

    brokersData_expire = now + (5 * 60 * 1000)

    return brokersData[server]
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


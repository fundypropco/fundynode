import Broker from "../models/Broker"

let brokersData = null
let brokersData_expire = null

export async function getBrokerData(server) {
    const now = Date.now()

    if (brokersData[server] && now < brokersData_expire) {
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


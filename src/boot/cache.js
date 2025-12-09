import Broker from "../models/Broker"

let brokersDiff = null

export async function getBrokersDiff() {
    if (brokersDiff) {
        return brokersDiff
    }

    brokersDiff = await Broker.find().map(b => ({
        [b.server]: {
            diff_time: b.diff_time
        }
    }))

    return brokersDiff

}

export async function setBrokersDiff() {

    brokersDiff = await Broker.find().map(b => ({
        [b.server]: {
            diff_time: b.diff_time
        }
    }))

    return brokersDiff

}

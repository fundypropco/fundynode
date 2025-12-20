import Account from "../models/Account.js";
import GetUpdate from "../models/GetUpdate.js";
import Broker from "../models/Broker.js";
import { ACTION_HANDLER } from '../helpers/constant.js'
import { makeMsgForHandler, makeID } from '../helpers/helper.js'

const brokerSymbolsSeeder = async (serverName = 'all') => {

    const accServers = []
    if (serverName == 'all') {
        const brokers = await Broker.find()
        const servers = new Set()
        for (const broker of brokers) {
            if (!servers.has(broker.server)) {
                servers.add(broker.server)
                accServers.push({ acc: broker.acc, server: broker.server })
            }
        }
    } else if (serverName == 'old') {
        const [result] = await Account.aggregate([
            {
                $match: {
                    copy: true,
                    $or: [
                        { server: serverName },
                        { "copiers.server": serverName }
                    ]
                }
            },
            {
                $unwind: {
                    path: "$copiers", preserveNullAndEmptyArrays: true
                }
            },
            {
                $match: {
                    copy: true,
                    $or: [
                        { server: serverName },
                        { "copiers.server": serverName, "copiers.copy": true }
                    ]
                }
            },
            {
                $project: {
                    _id: 0,
                    acc: {
                        $cond: [
                            { $eq: ["$server", serverName] },
                            "$acc",
                            "$copiers.acc"
                        ]
                    }
                }
            },
            { $limit: 1 }
        ]).collation({ locale: 'en', strength: 2 })

        if (result) {
            accServers.push({ acc: result.acc, server: serverName })
        }
    } else {
        const broker = await Broker.findOne({ server: serverName })
        accServers.push({ acc: broker.acc, server: serverName })
    }

    let keyid = makeID()

    for (const accServer of accServers) {
        const handler = ACTION_HANDLER.BROKER_SYMBOLS
        const pendingGetUpdate = await GetUpdate.findOne({ server: accServer.server, handler: handler, status: 'pending' })

        if (!pendingGetUpdate) {
            keyid++
            const getUpdate = new GetUpdate({
                acc: accServer.acc,
                server: accServer.server,
                handler: handler,
                keyid: keyid,
                status: 'pending',
                message: await makeMsgForHandler(handler, { acc: accServer.acc, keyid: keyid }),
            })
            await getUpdate.save()
        }
    }
}

export default brokerSymbolsSeeder
import Account from "../models/Account.js";
import GetUpdate from "../models/GetUpdate.js";
import { ACTION_HANDLER } from '../helpers/constant.js'
import { makeMsgForHandler, makeID } from '../helpers/helper.js'

const brokerSymbolsSeeder = async (serverName = 'all') => {

    const accServers = []
    if (serverName == 'all') {
        // پیدا کردن حسابهای معاملاتی با وضعیت کپی فعال
        const accounts = await Account.find({ copy: true })

        const servers = new Set()

        for (const account of accounts) {
            if (!servers.has(account.server)) {
                servers.add(account.server)
                accServers.push({ acc: account.acc, server: account.server })
            }

            for (const copier of account.copiers) {
                if (!servers.has(copier.server) && copier.copy) {
                    servers.add(copier.server)
                    accServers.push({ acc: copier.acc, server: copier.server })
                }
            }
        }
    } else {
        const result = await Account.aggregate([
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

        if (result.length) {
            accServers.push({ acc: result[0].acc, server: serverName })
        }
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
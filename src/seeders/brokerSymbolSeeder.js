import Account from "../models/Account.js";
import GetUpdate from "../models/GetUpdate.js";
import { ACTION_HANDLER } from '../helpers/constant.js'
import { makeMsgForHandler, makeID } from '../helpers/helper.js'

const brokerSymbolSeeder = async () => {

    const accounts = await Account.find({ copy: true })

    const servers = []
    const accServers = []

    for (const account of accounts) {
        if (!servers.includes(account.server)) {
            servers.push(account.server)
            accServers.push({ acc: account.acc, server: account.server })
        }

        for (const copier of account.copiers) {
            if (!servers.includes(copier.server)) {
                servers.push(copier.server)
                accServers.push({ acc: account.acc, server: account.server })
            }
        }
    }

    let keyid = makeID()

    for (const accServer of accServers) {
        const handler = ACTION_HANDLER.BROKER_SYMBOLS
        const pendingGetUpdate = await GetUpdate.findOne({ acc: accServer.acc, handler: handler, status: 'pending' })

        if (!pendingGetUpdate) {
            keyid++
            const getUpdate = new GetUpdate({
                acc: accServer.acc,
                handler: handler,
                message: await makeMsgForHandler(handler, { acc: accServer.acc, keyid: keyid }),
                keyid: keyid,
                status: 'pending',
                server: accServer.server
            })
            await getUpdate.save()
        }

    }
}

export default brokerSymbolSeeder
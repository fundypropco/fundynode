import express from 'express'
import './boot/index.js'
import routes from './routes/index.js'
import middlewares from './middlewares/index.js';
import exception from './middlewares/exception.js';
import notfound from './middlewares/404.js'
import runSeeders from './seeders/index.js';

runSeeders()
const app = express()
middlewares(app)
routes(app)
exception(app)
notfound(app)

import { syncAccountIndexes } from "./models/Account.js"
import { syncAccountReportIndexes } from "./models/AccountReport.js"
import { syncBrokerIndexes } from "./models/Broker.js"
import { syncGetUpdateIndexes } from "./models/GetUpdate.js"
import { syncSymbolIndexes } from "./models/Symbol.js"

// const schedule = require('./schedules/test')
// require('./schedules/cron')

const runApp = async (port) => {
    app.listen(port, () => {
        console.log(`app is running on port: ${port}`)
    })

    await syncAccountIndexes()
    await syncAccountReportIndexes()
    await syncBrokerIndexes()
    await syncGetUpdateIndexes()
    await syncSymbolIndexes()
}

export default runApp

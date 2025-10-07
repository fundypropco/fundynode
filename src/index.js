const express = require('express')
const app = express()

require('./boot')
require('./middlewares')(app)
require('./routes')(app)
require('./middlewares/exception')(app)
require('./middlewares/404')(app)

const { syncAccountIndexes } = require("./models/Account")
const { syncAccountReportIndexes } = require("./models/AccountReport")
const { syncBrokerIndexes } = require("./models/Broker")
const { syncGetUpdateIndexes } = require("./models/GetUpdate")
const { syncSymbolIndexes } = require("./models/Symbol")


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

module.exports = runApp

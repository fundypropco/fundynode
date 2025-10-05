const express = require('express')
const app = express()

require('./boot')
require('./middlewares')(app)
require('./routes')(app)
require('./middlewares/exception')(app)
require('./middlewares/404')(app)

// const schedule = require('./schedules/test')
// require('./schedules/cron')

const runApp = (port) => {
    app.listen(port, () => {
        console.log(`app is running on port: ${port}`)

    })
}

module.exports = runApp

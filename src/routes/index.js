const spiderRouter = require('./spider.js')

module.exports = (app) => {
    app.use('/api/spider', spiderRouter)
}

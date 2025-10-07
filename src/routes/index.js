import spiderRouter from './spider.js'

export default (app) => {
    app.use('/api/spider', spiderRouter)
}

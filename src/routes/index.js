import spiderRouter from './spider.js'

export default (app) => {
    app.get('/healthcheck', (req, res) => res.json({ message: 'success' }))
    app.use('/api/spider', spiderRouter)
}

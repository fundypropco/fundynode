import spiderRouter from './spider.js'
import adminRouter from './admin.js'

export default (app) => {
    app.get('/healthcheck', (req, res) => res.json({ message: 'success' }))
    app.use('/api/spider', spiderRouter)
    app.use('/api/admin', adminRouter)
}

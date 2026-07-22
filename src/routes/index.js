import spiderRouter from './spider.js'
import adminRouter from './admin.js'
import telegramRouter from './telegram.js'
import { add2AppQueue } from '../services/QueueService.js'
import tradingroomRouter from './tradingroom.js'

export default (app) => {
    app.get('/healthcheck', (req, res) => res.json({ message: 'success' }))
    app.get('/test-queue', async (req, res) => {
        await add2AppQueue('run-seeders')
        return res.json({ message: 'success' })
    })
    app.use('/api/spider', spiderRouter)
    app.use('/api/admin', adminRouter)
    app.use('/api/telegram', telegramRouter)
    app.use('/api/tradingroom', tradingroomRouter)
}

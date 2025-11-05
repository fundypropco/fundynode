import spiderRouter from './spider.js'
import adminRouter from './admin.js'

export default (app) => {
    app.get('/healthcheck', (req, res) => res.json({ message: 'success' }))
    app.use('/api/spider', spiderRouter)
    app.use('/api/admin', adminRouter)
    app.get('/test', (req, res) => {
        const total = 19
        const clusters = 3
        const size = (total >= clusters) ? Math.floor(total / clusters) : total
        const remainder = total > clusters ? total % clusters : 0
        const parts = []
        const clusterCount = total < clusters ? 1 : clusters
        for (let i = 0; i < clusterCount; i++) {
            const prev = parts[i - 1] || 0
            const extra = i === clusterCount - 1 ? remainder : 0
            parts[i] = prev + size + extra
        }

        const x = 1
        const trades = []
        for (let i = 0; i < total; i++) {
            if (parts.includes(i + 1)) {
                trades.push(i) // handle 21
            }
        }

        res.json([parts, trades])
        // res.json(parts)
    })
}

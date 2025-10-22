import spiderRouter from './spider.js'
import { makeID } from '../helpers/helper.js'

export default (app) => {
    app.get('/healthcheck', (req, res) => res.json({ message: 'success' }))
    app.use('/api/spider', spiderRouter)
}

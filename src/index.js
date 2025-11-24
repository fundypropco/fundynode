import express from 'express'
import boot from './boot/index.js'
import routes from './routes/index.js'
import middlewares from './middlewares/index.js'
import exception from './middlewares/exception.js'
import notfound from './middlewares/404.js'
import runSchedule, { runSeed } from './schedules/run.js'

await boot()
await runSeed()
const app = express()

middlewares(app)
routes(app)
exception(app)
notfound(app)
await runSchedule()

const runApp = async (port) => {
    app.listen(port, () => {
        console.log(`app is running on port: ${port}`)
    })
}

export default runApp

import { Worker } from "bullmq";
import boot from './src/boot/index.js'
import getRedis from "./src/boot/redis.js";
import logger from "./src/helpers/logger.js"
import { checkTradeMap } from "./src/schedules/job.js";

await boot()
const redis = await getRedis()

const worker = new Worker("app-queue",
    async (job) => {
        // job.name, job.data
        try {
            // if (job.name === 'run-seeders') {
            //     await seed()
            // }
            // if (job.name === 'equity-refresh') {
            //     await getOpenTradesProfit()
            // }
            if (job.name === 'checkTradeMap') {
                await checkTradeMap()
            }
        } catch (err) {
            console.log(err)
            logger.error(err)
            // #. retry
            //throw err
        }
    },
    {
        connection: redis,
        concurrency: 5
    }
)

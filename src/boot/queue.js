import { Queue } from "bullmq"
import getRedis from "./redis.js"

let appQueue = null

export async function getAppQueue() {
    if (appQueue) return appQueue
    const redis = await getRedis()
    appQueue = new Queue("app-queue", { connection: redis })
    return appQueue
}

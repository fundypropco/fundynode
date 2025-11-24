import getMongo from "./mongo.js"
import getRedis from "./redis.js"
import { getAppQueue } from "./queue.js"

export default async function boot() {
    await Promise.all([
        getMongo(),
        getRedis(),
        getAppQueue(),
    ])
    console.log("🚀 System Boot Completed")
}
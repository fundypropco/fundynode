import Redis from "ioredis";

let redis = null
let initPromise = null

async function getRedis() {
    if (redis) return redis
    if (initPromise) return initPromise

    initPromise = (async () => {
        const client = new Redis({
            host: process.env.REDIS_HOST,
            port: process.env.REDIS_PORT,
            maxRetriesPerRequest: null
        })

        client.on("connect", () => console.log("✅ Redis connected"))
        client.on("ready", () => console.log("✅ Redis ready to use"))
        client.on("error", (err) => console.error("❌ Redis error:", err))
        client.on("end", () => console.log("🔴 Redis connection closed"))

        await new Promise((resolve, reject) => {
            client.once("ready", resolve)
            client.once("error", reject)
        });

        redis = client
        initPromise = null
        return redis
    })()

    return initPromise
}

export default getRedis
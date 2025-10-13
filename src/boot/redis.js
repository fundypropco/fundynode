import Redis from "ioredis";

let redis = null;

export default function startRedis() {
    if (redis) return redis;

    redis = new Redis({
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
    });

    redis.on("connect", () => console.log("✅ Redis connected"));
    redis.on("ready", () => console.log("✅ Redis ready to use"));
    redis.on("error", (err) => console.error("❌ Redis error:", err));
    redis.on("end", () => console.log("🔴 Redis connection closed"));

    return redis;
}
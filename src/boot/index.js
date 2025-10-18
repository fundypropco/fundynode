import startMongoDB from './mongo.js'
import startRedis from './redis.js'

await startMongoDB()
await startRedis()
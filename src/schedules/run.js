import { add2AppQueue } from '../services/QueueService.js'

export async function runTradeMapChecker() {
    return add2AppQueue('checkTradeMap', {}, { every: 30000 }, 'checkTradeMap')
}

export async function runSeed() {
    return await add2AppQueue('run-seeders')
}

export default async function runSchedule() {
    return Promise.all([
        runTradeMapChecker(),
    ])
}
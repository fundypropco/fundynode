import { add2AppQueue } from '../services/QueueService.js'

export async function runEquityRefresh() {
    return add2AppQueue('equity-refresh', {}, { every: 1000 }, 'equity-refresh')
}

export async function runSeed() {
    return add2AppQueue('run-seeders')
}

export default async function runSchedule() {
    return Promise.all([
        runEquityRefresh(),
    ])
}
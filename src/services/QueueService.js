import { getAppQueue } from '../boot/queue.js'

export async function add2AppQueue(jobName, jobData = {}, repeat = {}, jobId = '') {
    const appQueue = await getAppQueue()

    if (jobId == '') {
        jobId = jobName + '_' + Math.floor(Date.now() / 1000).toString()
    }

    await appQueue.add(
        jobName,
        jobData,
        {
            repeat,
            jobId
        }
    )
    return
}
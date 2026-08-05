import mongoose from "mongoose"

const requestLogSchema = new mongoose.Schema({
    handler: {
        type: Number,
        index: true
    },
    message: {
        type: String
    },
    response: {
        type: Object
    },
    datetime: {
        type: String
    },
    reqTime: {
        type: Number,
        index: true
    },
    resTime: {
        type: Number,
        index: true
    },
    duration: {
        type: Number,
        index: true
    }
});

const RequestLog = mongoose.model('RequestLog', requestLogSchema, 'request_logs')

export default RequestLog

export async function createRequestLogIndexes() {
    try {
        await RequestLog.createIndexes();
    } catch (err) {
        console.error("❌ Error Syncing Symbol indexes:", err);
    }
}
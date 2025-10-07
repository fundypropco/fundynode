import mongoose from "mongoose"

const requestLogSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['SendMessage', 'GetUpdateResponse']
    },
    message: {
        type: String
    },
    datetime: {
        type: Date
    }
});

const RequestLog = mongoose.model('RequestLog', requestLogSchema, 'request_logs')

export default RequestLog

export async function syncRequestLogIndexes() {
    try {
        await RequestLog.syncIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
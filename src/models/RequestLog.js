const mongoose = require("mongoose");

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

exports.RequestLog = RequestLog

exports.syncRequestLogIndexes = async function () {
    try {
        await RequestLog.syncIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
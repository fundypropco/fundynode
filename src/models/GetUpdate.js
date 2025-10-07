const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
    acc: {
        type: String
    },
    handler: {
        type: Number
    },
    message: {
        type: String
    },
    datetime: {
        type: Date,
        index: true
    },
    keyid: {
        type: Number,
        index: true
    },
    try_count: {
        type: Number,
        default: 0,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'error'],
        index: true,
        default: 'pending'
    },
    description: {
        type: [String],
        default: []
    }
});

// مواردی که در وضعیت خطا قرار دارند و هیچ تلاشی روی آنها صورت نگرفته به معنی خطا در سمت اپلیکیشن هستند

const GetUpdate = mongoose.model('GetUpdate', accountSchema, 'get_updates')

exports.GetUpdate = GetUpdate

exports.syncGetUpdateIndexes = async function () {
    try {
        await GetUpdate.syncIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
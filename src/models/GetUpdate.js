import mongoose from "mongoose"

const getUpdateSchema = new mongoose.Schema({
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
        default: Date.now,
        index: true
    },
    keyid: {
        type: Number,
    },
    try_count: {
        type: Number,
        default: 0,
        index: true
    },
    status: {
        type: String,
        enum: ['pending', 'success', 'error', 'internal_error', 'waiting'],
        index: true,
        default: 'pending'
    },
    description: {
        type: [String],
        default: []
    },
    origin: {
        type: String,
        index: true
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});


getUpdateSchema.index({ acc: 1, handler: 1, keyid: 1 })

const GetUpdate = mongoose.model('GetUpdate', getUpdateSchema, 'get_updates')

export default GetUpdate

export async function syncGetUpdateIndexes() {
    try {
        await GetUpdate.syncIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
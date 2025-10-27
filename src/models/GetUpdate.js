import mongoose from "mongoose"

const getUpdateSchema = new mongoose.Schema({
    acc: {
        type: Number,
        index: true,
    },
    ticket: {
        type: Number,
        index: true,
        default: 0
    },
    server: {
        type: String,
        default: '',
        index: true,
    },
    handler: {
        type: Number,
        index: true,
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
        index: true
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
    origin_acc: {
        type: Number,
        index: true,
        default: 0
    },
    origin_ticket: {
        type: Number,
        index: true,
        default: 0
    },
    origin_new_ticket: {
        type: Number,
        default: ''
    },
    updated_at: {
        type: Date,
        default: Date.now
    }
});


getUpdateSchema.index({ acc: 1, handler: 1 })
getUpdateSchema.index({ server: 1, handler: 1 })
getUpdateSchema.index({ origin_acc: 1, origin_ticket: 1 })

const GetUpdate = mongoose.model('GetUpdate', getUpdateSchema, 'get_updates')

export default GetUpdate

export async function createGetUpdateIndexes() {
    try {
        await GetUpdate.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
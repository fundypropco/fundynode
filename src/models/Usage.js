import mongoose from "mongoose"

const usageSchema = new mongoose.Schema({
    acc: {
        type: Number,
        index: true,
    },
    cpu: {
        type: Number,
        index: true
    },
    ram: {
        type: Number,
        index: true
    },
    disk: {
        type: Number,
    },
    net: {
        type: Number,
    },
    datetime: {
        type: String,
    },
    timestamp: {
        type: Number,
        index: true
    }

})

const Usage = mongoose.model('Usage', usageSchema, 'usage');

export default Usage

export async function createUsageIndexes() {
    try {
        await Usage.createIndexes();
    } catch (err) {
        console.error("❌ Error Syncing Usage indexes:", err);
    }
}
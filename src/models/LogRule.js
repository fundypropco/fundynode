import mongoose from "mongoose"

const logRuleSchema = new mongoose.Schema({
    handler: {
        type: Number,
        index: true,
        unique: true,
    },
    log: {
        type: Boolean,
    }
})

const LogRule = mongoose.model('LogRule', logRuleSchema, 'log_rules');

export default LogRule

export async function createLogRuleIndexes() {
    try {
        await LogRule.createIndexes();
    } catch (err) {
        console.error("❌ Error Syncing LogRule indexes:", err);
    }
}
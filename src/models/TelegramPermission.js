import mongoose from "mongoose"

const telegramPermissionSchema = new mongoose.Schema({
    acc: {
        type: Number,
        required: true,
        index: true
    },
    rule: {
        type: String,
        default: ''
    }
});


const TelegramPermission = mongoose.model('TelegramPermission', telegramPermissionSchema, 'telegram_permissions');

export default TelegramPermission

export async function createTelegramPermissionIndexes() {
    try {
        await TelegramPermission.createIndexes();
    } catch (err) {
        console.error("❌ Error Syncing TelegramPermission indexes:", err);
    }
}
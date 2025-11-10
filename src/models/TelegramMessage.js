import mongoose from "mongoose"

const telegramMessageSchema = new mongoose.Schema({
    message: {
        type: String,
        default: ''
    },
    datetime: {
        type: Date,
        default: Date.now,
        index: true
    },
});


const TelegramMessage = mongoose.model('TelegramMessage', telegramMessageSchema, 'telegram_messages');

export default TelegramMessage

export async function createTelegramMessageIndexes() {
    try {
        await TelegramMessage.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing TelegramMessage indexes:", err);
    }
}
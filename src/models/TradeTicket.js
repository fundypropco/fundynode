import mongoose from "mongoose"

const tradeTicketSchema = new mongoose.Schema({
    acc_src: {
        type: String,
    },
    ticket_src: {
        type: String
    },
    acc_dist: {
        type: String
    },
    ticket_dist: {
        type: String
    }
});

tradeTicketSchema.index({ acc_src: 1, ticket_src: 1 })

const TradeTicket = mongoose.model('TradeTicket', tradeTicketSchema, 'trade_tickets');

export default TradeTicket

export async function syncTradeTicketIndexes() {
    try {
        await TradeTicket.syncIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
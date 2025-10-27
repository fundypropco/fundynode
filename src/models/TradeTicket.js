import mongoose from "mongoose"

const tradeTicketSchema = new mongoose.Schema({
    acc_src: {
        type: Number,
    },
    ticket_src: {
        type: Number
    },
    acc_dist: {
        type: Number
    },
    ticket_dist: {
        type: Number
    }
});

tradeTicketSchema.index({ acc_src: 1, ticket_src: 1 })

const TradeTicket = mongoose.model('TradeTicket', tradeTicketSchema, 'trade_tickets');

export default TradeTicket

export async function createTradeTicketIndexes() {
    try {
        await TradeTicket.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
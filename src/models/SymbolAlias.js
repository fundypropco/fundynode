import mongoose from "mongoose"

const symbolAliasSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    alias: {
        type: [String],
        default: []
    },
    weight: {
        type: Number,
        default: 0,
    },
});

const SymbolAlias = mongoose.model('SymbolAlias', symbolAliasSchema, 'symbol_alias');

export default SymbolAlias

export async function createSymbolAliasIndexes() {
    try {
        await SymbolAlias.createIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
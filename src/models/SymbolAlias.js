const mongoose = require("mongoose");

const symbolAliasSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        unique: true
    },
    alias: {
        type: [String]
    }
});

const SymbolAlias = mongoose.model('SymbolAlias', symbolAliasSchema, 'symbol_alias');

exports.SymbolAlias = SymbolAlias

exports.syncSymbolAliasIndexes = async function () {
    try {
        await SymbolAlias.syncIndexes();
    } catch (err) {
        console.error("❌ Error syncing Symbol indexes:", err);
    }
}
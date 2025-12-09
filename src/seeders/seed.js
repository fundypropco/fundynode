import symbolAliasSeeder from "./symbolAliasSeeder.js"
import brokerSymbolsSeeder from "./brokerSymbolsSeeder.js"

const seed = async () => {
    await symbolAliasSeeder()
    await brokerSymbolsSeeder()
}

export default seed
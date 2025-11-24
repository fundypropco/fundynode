import symbolAliasSeeder from "./symbolAliasSeeder.js"
import brokerSymbolSeeder from "./brokerSymbolSeeder.js"

const seed = async () => {
    await symbolAliasSeeder()
    await brokerSymbolSeeder()
}

export default seed
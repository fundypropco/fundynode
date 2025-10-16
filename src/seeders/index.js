import symbolAliasSeeder from "./symbolAliasSeeder.js"
import brokerSymbolSeeder from "./brokerSymbolSeeder.js"

const runSeeders = async () => {
    await symbolAliasSeeder()
    await brokerSymbolSeeder()
}

export default runSeeders
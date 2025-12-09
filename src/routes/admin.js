import express from 'express'
import adminController from '../controllers/admin.js'

const router = express.Router()

router.get('/seed-symbol-alias', adminController.seedSymbolAlias)
router.get('/seed-broker-symbols/:server', adminController.seedBrokerSymbols)
router.get('/seed-broker-symbols-data/:server', adminController.seedBrokerSymbolsData)

router.get('/trade-map/:accSrc', adminController.showTradeMap)

export default router

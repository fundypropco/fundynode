import express from 'express'
import adminController from '../controllers/admin.js'

const router = express.Router()

router.post('/seed-symbol-alias', adminController.seedSymbolAlias)
router.post('/seed-log-rules', adminController.seedLogRules)
router.post('/seed-broker-symbols/:server', adminController.seedBrokerSymbols)
router.post('/seed-broker-symbols-data/:server', adminController.seedBrokerSymbolsData)
router.get('/trade-map/:accSrc', adminController.showTradeMap)

export default router

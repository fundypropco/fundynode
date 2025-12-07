import express from 'express'
import adminController from '../controllers/admin.js'

const router = express.Router()

router.get('/seed-broker-symbols/:server', adminController.seedBrokerSymbols)

router.get('/trade-map/:accSrc', adminController.showTradeMap)

export default router

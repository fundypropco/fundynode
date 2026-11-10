import express from 'express'
import adminController from '../controllers/admin.js'

const router = express.Router()

router.post('/seed-symbol-alias', adminController.seedSymbolAlias)
router.post('/seed-log-rules', adminController.seedLogRules)
router.post('/seed-broker-symbols/:acc', adminController.seedBrokerSymbols)
router.post('/seed-broker-symbols-data/:acc', adminController.seedBrokerSymbolsData)
router.get('/trade-map/:accSrc', adminController.showTradeMap)
// #. پنل ادمین FundyPanel: بروکرها ، نمادهای هر بروکر (معامله فعال / غیرفعال) و راهنمای نمادها (2026-10-18)
router.get('/brokers', adminController.brokers)
router.post('/set-broker', adminController.setBroker)
router.post('/delete-broker', adminController.deleteBroker)
router.get('/broker-symbols/:brokerKey', adminController.brokerSymbols)
router.post('/set-symbols-tradable', adminController.setSymbolsTradable)
router.get('/trading-control', adminController.tradingControl)
router.post('/set-trading-control', adminController.setTradingControl)
router.get('/symbol-aliases', adminController.symbolAliases)
router.post('/set-symbol-alias', adminController.setSymbolAlias)
router.post('/delete-symbol-alias', adminController.deleteSymbolAlias)

export default router

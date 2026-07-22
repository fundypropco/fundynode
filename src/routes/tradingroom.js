import express from 'express'
import tradingroomController from '../controllers/tradingroom.js'

const router = express.Router()

router.get('/GetUpdates/:acc', tradingroomController.getUpdates)

export default router

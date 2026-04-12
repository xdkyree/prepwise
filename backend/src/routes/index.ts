import { Router } from 'express'
import { generatePlan, grainCalc, swapMeal } from '../controllers/planController.js'
import { picnicCheckout } from '../controllers/picnicController.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, timestamp: new Date().toISOString() })
})

router.post('/generate-plan', generatePlan)
router.post('/swap-meal', swapMeal)
router.post('/grain-calc', grainCalc)
router.post('/picnic-checkout', picnicCheckout)

export default router

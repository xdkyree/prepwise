import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import routes from './routes/index.js'
import { buildError } from './middleware/error.js'

dotenv.config()

const app = express()

app.use(
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  })
)
app.use(express.json({ limit: '1mb' }))

app.use('/api', routes)

app.use((_req, res) => {
  res.status(404).json(buildError('NOT_FOUND', 'Endpoint not found'))
})

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : 'Unexpected server error'
  const status = typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
    ? (err as { status: number }).status
    : 500

  if (status === 400 && /json/i.test(message)) {
    res.status(400).json(buildError('VALIDATION_ERROR', 'Malformed JSON body'))
    return
  }

  res.status(status).json(buildError('SERVER_ERROR', message))
})

export default app

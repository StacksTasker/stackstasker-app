// StacksTasker API - Main entry point
// Express server for the AI agent task marketplace

import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import taskRoutes from './routes/tasks.js';
import agentRoutes from './routes/agents.js';
import webhookRoutes from './routes/webhooks.js';
import { optionalWalletAuth } from './middleware/auth.js';
import { getStats, setFacilitatorUrl } from './services/task-engine.js';
import { initDb } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = parseInt(process.env.API_PORT ?? '3003', 10);
const FACILITATOR_URL = process.env.FACILITATOR_URL ?? 'http://localhost:4000';

// Configure facilitator
setFacilitatorUrl(FACILITATOR_URL);

// Rate limiting
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(optionalWalletAuth);

// Apply rate limits
app.use('/tasks', (req, _res, next) => {
  if (req.method === 'GET') return readLimiter(req, _res, next);
  return writeLimiter(req, _res, next);
});
app.use('/agents', (req, _res, next) => {
  if (req.method === 'GET') return readLimiter(req, _res, next);
  return writeLimiter(req, _res, next);
});
app.use('/webhooks', (req, _res, next) => {
  if (req.method === 'GET') return readLimiter(req, _res, next);
  return writeLimiter(req, _res, next);
});

// Serve static frontend files (extensions enables clean URLs: /task → task.html)
const webDir = join(__dirname, '../../web');
app.use(express.static(webDir, { extensions: ['html'] }));

// API routes
app.use('/tasks', taskRoutes);
app.use('/agents', agentRoutes);
app.use('/webhooks', webhookRoutes);

// GET /stats - Platform statistics
app.get('/stats', async (req, res) => {
  const network = req.query.network as string | undefined;
  res.json(await getStats(network === 'testnet' || network === 'mainnet' ? network : undefined));
});

// GET /config - Public config for frontend (contract addresses, etc.)
app.get('/config', (_req, res) => {
  res.json({
    paymentContract: {
      address: process.env.PAYMENT_CONTRACT_ADDRESS || 'STV4JB5CZWFD8BN9XMDV0F4KTS44BKRZ8V496T8W',
      name: process.env.PAYMENT_CONTRACT_NAME || 'stackstasker-payments',
    },
    platformWallet: {
      testnet: process.env.PLATFORM_WALLET_TESTNET || 'STV4JB5CZWFD8BN9XMDV0F4KTS44BKRZ8V496T8W',
      mainnet: process.env.PLATFORM_WALLET_MAINNET || 'SPV4JB5CZWFD8BN9XMDV0F4KTS44BKRZ8TEM307V',
    },
  });
});

// GET /health - Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'stackstasker-api',
    networks: ['testnet', 'mainnet'],
    timestamp: new Date().toISOString(),
  });
});

// Start server
const isMain = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isMain && !process.env.NO_AUTO_START) {
  initDb().then(() => {
    app.listen(PORT, () => {
      console.log(`[StacksTasker API] Running on http://localhost:${PORT}`);
      console.log(`[StacksTasker API] Facilitator: ${FACILITATOR_URL}`);
      console.log(`[StacksTasker API] Network: testnet`);
      console.log(`[StacksTasker API] Serving UI from: ${webDir}`);
    });
  }).catch((err) => {
    console.error('[StacksTasker API] Failed to initialize database:', err);
    process.exit(1);
  });
}

export { app };

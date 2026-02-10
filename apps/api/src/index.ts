// StacksTasker API - Main entry point
// Express server for the AI agent task marketplace

import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import taskRoutes from './routes/tasks.js';
import agentRoutes from './routes/agents.js';
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

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(optionalWalletAuth);

// Serve static frontend files
const webDir = join(__dirname, '../../web');
app.use(express.static(webDir));

// API routes
app.use('/tasks', taskRoutes);
app.use('/agents', agentRoutes);

// GET /stats - Platform statistics
app.get('/stats', async (_req, res) => {
  res.json(await getStats());
});

// GET /health - Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'stackstasker-api',
    facilitator: FACILITATOR_URL,
    network: 'testnet',
    timestamp: new Date().toISOString(),
  });
});

// Serve docs.html at /docs
app.get('/docs', (_req, res) => {
  res.sendFile(join(webDir, 'docs.html'));
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

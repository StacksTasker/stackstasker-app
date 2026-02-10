// Vercel serverless entry point
// Re-exports the Express app from apps/api for Vercel's serverless runtime
import { app } from '../apps/api/dist/index.js';
import { initDb } from '../apps/api/dist/db.js';

// Initialize DB tables on cold start
let dbReady = initDb().catch(console.error);

// Wrap the app to ensure DB is ready before handling requests
export default async function handler(req, res) {
  await dbReady;
  return app(req, res);
}

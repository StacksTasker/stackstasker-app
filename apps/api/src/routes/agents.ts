// StacksTasker API - Agent routes

import { Router } from 'express';
import {
  registerAgent,
  getAgent,
  listAgents,
  getAgentProfile,
  updateAgent,
  submitReview,
  listReviews,
} from '../services/task-engine.js';
import type { RegisterAgentRequest, SubmitReviewRequest, TaskCategory } from '../types.js';

const router = Router();

const VALID_CATEGORIES: TaskCategory[] = ['web-scraping', 'data-pipeline', 'smart-contract', 'coding', 'api-integration', 'monitoring', 'testing', 'other'];
const STX_ADDRESS_RE = /^S[A-Z0-9]{39,40}$/;

// POST /agents/register - Register a new AI agent
router.post('/register', async (req, res) => {
  try {
    const body = req.body as RegisterAgentRequest;

    if (!body.name || !body.walletAddress) {
      res.status(400).json({ error: 'Missing required fields: name, walletAddress' });
      return;
    }

    const name = String(body.name).trim();
    if (name.length === 0 || name.length > 100) {
      res.status(400).json({ error: 'Name must be between 1 and 100 characters' });
      return;
    }

    const walletAddress = String(body.walletAddress).trim();
    if (!STX_ADDRESS_RE.test(walletAddress)) {
      res.status(400).json({ error: 'Invalid Stacks wallet address format' });
      return;
    }

    const capabilities = body.capabilities || ['other'];
    if (!Array.isArray(capabilities) || capabilities.length === 0) {
      res.status(400).json({ error: 'Capabilities must be a non-empty array' });
      return;
    }
    for (const cap of capabilities) {
      if (!VALID_CATEGORIES.includes(cap)) {
        res.status(400).json({ error: `Invalid capability: ${cap}. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
        return;
      }
    }

    const agent = await registerAgent({
      name,
      walletAddress,
      capabilities,
      bio: body.bio,
    });

    res.status(201).json(agent);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to register agent' });
  }
});

// GET /agents - List all agents
router.get('/', async (_req, res) => {
  const agents = await listAgents();
  res.json({ agents, count: agents.length });
});

// GET /agents/:id - Get agent detail
router.get('/:id', async (req, res) => {
  const agent = await getAgent(req.params.id);
  if (!agent) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json(agent);
});

// GET /agents/:id/profile - Get full agent profile with stats and reviews
router.get('/:id/profile', async (req, res) => {
  const profile = await getAgentProfile(req.params.id);
  if (!profile) {
    res.status(404).json({ error: 'Agent not found' });
    return;
  }
  res.json(profile);
});

// PUT /agents/:id - Update agent profile
router.put('/:id', async (req, res) => {
  const { bio, capabilities } = req.body as { bio?: string; capabilities?: TaskCategory[] };

  const result = await updateAgent(req.params.id, { bio, capabilities });
  if ('error' in result) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

// POST /agents/:id/review - Submit a review for an agent
router.post('/:id/review', async (req, res) => {
  const body = req.body as SubmitReviewRequest;

  if (!body.taskId || !body.rating || !body.comment || !body.reviewerAddress) {
    res.status(400).json({ error: 'Missing required fields: taskId, rating, comment, reviewerAddress' });
    return;
  }

  const result = await submitReview(req.params.id, body);
  if ('error' in result) {
    res.status(400).json(result);
    return;
  }

  res.status(201).json(result);
});

// GET /agents/:id/reviews - List all reviews for an agent
router.get('/:id/reviews', async (req, res) => {
  const agentReviews = await listReviews(req.params.id);
  res.json({ reviews: agentReviews, count: agentReviews.length });
});

export default router;

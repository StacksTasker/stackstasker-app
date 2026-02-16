// StacksTasker API - Task routes

import { Router } from 'express';
import {
  createTask,
  getTask,
  listTasks,
  acceptTask,
  startTask,
  cancelTask,
  submitResult,
  rejectResult,
  approveTask,
  closeTask,
  placeBid,
  listBids,
  getBidCount,
  acceptBid,
  postMessage,
  listMessages,
} from '../services/task-engine.js';
import type { CreateTaskRequest, SubmitResultRequest, PlaceBidRequest, PostMessageRequest, TaskStatus, TaskCategory, NetworkType } from '../types.js';

const router = Router();

const VALID_CATEGORIES: TaskCategory[] = ['web-scraping', 'data-pipeline', 'smart-contract', 'coding', 'api-integration', 'monitoring', 'testing', 'other'];

// POST /tasks - Create a new task
router.post('/', async (req, res) => {
  try {
    const body = req.body as CreateTaskRequest;

    if (!body.title || !body.description || !body.bounty || !body.posterAddress) {
      res.status(400).json({ error: 'Missing required fields: title, description, bounty, posterAddress' });
      return;
    }

    const title = String(body.title).trim();
    if (title.length === 0 || title.length > 200) {
      res.status(400).json({ error: 'Title must be between 1 and 200 characters' });
      return;
    }

    const description = String(body.description).trim();
    if (description.length === 0 || description.length > 5000) {
      res.status(400).json({ error: 'Description must be between 1 and 5000 characters' });
      return;
    }

    const bounty = parseFloat(String(body.bounty));
    if (isNaN(bounty) || bounty <= 0 || bounty > 1000) {
      res.status(400).json({ error: 'Bounty must be between 0 and 1000 STX' });
      return;
    }

    const category = (body.category || 'other') as TaskCategory;
    if (!VALID_CATEGORIES.includes(category)) {
      res.status(400).json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` });
      return;
    }

    const network = (body.network === 'mainnet' ? 'mainnet' : 'testnet') as NetworkType;

    const task = await createTask({
      title,
      description,
      category,
      bounty: body.bounty,
      posterAddress: body.posterAddress,
      network,
    });

    res.status(201).json(task);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to create task' });
  }
});

// GET /tasks - List tasks with optional filters
router.get('/', async (req, res) => {
  const status = req.query.status as TaskStatus | undefined;
  const category = req.query.category as TaskCategory | undefined;
  const poster = req.query.poster as string | undefined;
  const network = req.query.network as NetworkType | undefined;

  const tasks = await listTasks({ status, category, poster, network });

  // Enrich tasks with bid counts
  const enriched = await Promise.all(
    tasks.map(async t => ({
      ...t,
      bidCount: await getBidCount(t.id),
    }))
  );

  res.json({ tasks: enriched, count: enriched.length });
});

// GET /tasks/:id - Get task detail
router.get('/:id', async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }
  res.json({ ...task, bidCount: await getBidCount(task.id) });
});

// POST /tasks/:id/accept - Agent accepts a task (direct, no bid)
router.post('/:id/accept', async (req, res) => {
  const { agentId } = req.body as { agentId: string };

  if (!agentId) {
    res.status(400).json({ error: 'Missing agentId' });
    return;
  }

  const result = await acceptTask(req.params.id, agentId);
  if ('error' in result) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

// POST /tasks/:id/start - Agent marks task as in-progress
router.post('/:id/start', async (req, res) => {
  const { agentId } = req.body as { agentId: string };

  if (!agentId) {
    res.status(400).json({ error: 'Missing agentId' });
    return;
  }

  const result = await startTask(req.params.id, agentId);
  if ('error' in result) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

// POST /tasks/:id/cancel - Poster cancels open task
router.post('/:id/cancel', async (req, res) => {
  const { posterAddress } = req.body as { posterAddress: string };

  if (!posterAddress) {
    res.status(400).json({ error: 'Missing posterAddress' });
    return;
  }

  const result = await cancelTask(req.params.id, posterAddress);
  if ('error' in result) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

// POST /tasks/:id/submit - Agent submits result
router.post('/:id/submit', async (req, res) => {
  const { agentId, result } = req.body as SubmitResultRequest;

  if (!agentId || !result) {
    res.status(400).json({ error: 'Missing agentId or result' });
    return;
  }

  const task = await submitResult(req.params.id, agentId, result);
  if ('error' in task) {
    res.status(400).json(task);
    return;
  }

  res.json(task);
});

// POST /tasks/:id/reject - Poster rejects submission
router.post('/:id/reject', async (req, res) => {
  const { posterAddress, reason } = req.body as { posterAddress: string; reason: string };

  if (!posterAddress) {
    res.status(400).json({ error: 'Missing posterAddress' });
    return;
  }

  const result = await rejectResult(req.params.id, posterAddress, reason || 'No reason given');
  if ('error' in result) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

// POST /tasks/:id/approve - Approve submitted result (triggers payment)
router.post('/:id/approve', async (req, res) => {
  const { posterAddress } = req.body as { posterAddress?: string };

  // Look up the task to verify poster ownership
  const existing = await getTask(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  if (!posterAddress) {
    res.status(403).json({ error: 'Missing posterAddress' });
    return;
  }

  if (existing.posterAddress !== posterAddress) {
    res.status(403).json({ error: 'Only the task poster can approve' });
    return;
  }

  const task = await approveTask(req.params.id);
  if ('error' in task) {
    res.status(400).json(task);
    return;
  }

  res.json(task);
});

// POST /tasks/:id/close - Poster closes completed task
router.post('/:id/close', async (req, res) => {
  const { posterAddress } = req.body as { posterAddress: string };

  if (!posterAddress) {
    res.status(400).json({ error: 'Missing posterAddress' });
    return;
  }

  const result = await closeTask(req.params.id, posterAddress);
  if ('error' in result) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

// ─── Bidding Routes ──────────────────────────────────────────

// POST /tasks/:id/bid - Agent places a bid
router.post('/:id/bid', async (req, res) => {
  const body = req.body as PlaceBidRequest;

  if (!body.agentId || !body.amount || !body.message) {
    res.status(400).json({ error: 'Missing required fields: agentId, amount, message' });
    return;
  }

  const bidAmount = parseFloat(String(body.amount));
  if (isNaN(bidAmount) || bidAmount <= 0 || bidAmount > 1000) {
    res.status(400).json({ error: 'Bid amount must be between 0 and 1000 STX' });
    return;
  }

  const message = String(body.message).trim();
  if (message.length === 0 || message.length > 2000) {
    res.status(400).json({ error: 'Message must be between 1 and 2000 characters' });
    return;
  }

  const result = await placeBid(req.params.id, {
    agentId: body.agentId,
    amount: body.amount,
    message,
    estimatedTime: body.estimatedTime || 'Not specified',
  });

  if ('error' in result) {
    res.status(400).json(result);
    return;
  }

  res.status(201).json(result);
});

// GET /tasks/:id/bids - List bids for a task
router.get('/:id/bids', async (req, res) => {
  const taskBids = await listBids(req.params.id);
  res.json({ bids: taskBids, count: taskBids.length });
});

// POST /tasks/:id/bids/:bidId/accept - Poster accepts a bid
router.post('/:id/bids/:bidId/accept', async (req, res) => {
  const { posterAddress } = req.body as { posterAddress: string };

  if (!posterAddress) {
    res.status(400).json({ error: 'Missing posterAddress' });
    return;
  }

  const result = await acceptBid(req.params.id, req.params.bidId, posterAddress);
  if ('error' in result) {
    res.status(400).json(result);
    return;
  }

  res.json(result);
});

// ─── Message Routes ──────────────────────────────────────────

// POST /tasks/:id/messages - Post a message in the task thread
router.post('/:id/messages', async (req, res) => {
  try {
    const body = req.body as PostMessageRequest;

    if (!body.senderAddress || !body.body) {
      res.status(400).json({ error: 'Missing required fields: senderAddress, body' });
      return;
    }

    const senderAddress = String(body.senderAddress).trim();
    if (!senderAddress.startsWith('ST') && !senderAddress.startsWith('SP')) {
      res.status(400).json({ error: 'senderAddress must be a valid STX address' });
      return;
    }

    const msgBody = String(body.body).trim();
    if (msgBody.length === 0 || msgBody.length > 2000) {
      res.status(400).json({ error: 'Message body must be between 1 and 2000 characters' });
      return;
    }

    const result = await postMessage(req.params.id, {
      senderAddress,
      body: msgBody,
    });

    if ('error' in result) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Failed to post message' });
  }
});

// GET /tasks/:id/messages - List messages for a task thread
router.get('/:id/messages', async (req, res) => {
  const task = await getTask(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  const messages = await listMessages(req.params.id);
  res.json({ messages, count: messages.length });
});

export default router;

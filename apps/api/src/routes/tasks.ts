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
} from '../services/task-engine.js';
import type { CreateTaskRequest, SubmitResultRequest, PlaceBidRequest, TaskStatus, TaskCategory } from '../types.js';

const router = Router();

// POST /tasks - Create a new task
router.post('/', async (req, res) => {
  try {
    const body = req.body as CreateTaskRequest;

    if (!body.title || !body.description || !body.bounty || !body.posterAddress) {
      res.status(400).json({ error: 'Missing required fields: title, description, bounty, posterAddress' });
      return;
    }

    const task = await createTask({
      title: body.title,
      description: body.description,
      category: body.category || 'other',
      bounty: body.bounty,
      posterAddress: body.posterAddress,
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

  const tasks = await listTasks({ status, category });

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

  const result = await placeBid(req.params.id, {
    agentId: body.agentId,
    amount: body.amount,
    message: body.message,
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

export default router;

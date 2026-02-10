// StacksTasker - Task lifecycle engine + payment orchestration (Postgres-backed)

import { randomUUID } from 'crypto';
import { query, getClient } from '../db.js';

/** Convert STX to microSTX */
function stxToMicroStx(stx: number | string): string {
  const stxNum = typeof stx === 'string' ? parseFloat(stx) : stx;
  return Math.round(stxNum * 1_000_000).toString();
}
import type {
  Task,
  Agent,
  Bid,
  Review,
  TaskStatus,
  TaskCategory,
  CreateTaskRequest,
  RegisterAgentRequest,
  PlaceBidRequest,
  SubmitReviewRequest,
} from '../types.js';

// ─── Constants ──────────────────────────────────────────
const PLATFORM_FEE_PERCENT = 0.01; // 1%
const PLATFORM_WALLET = 'SPRG5SJWZ4TE23RJY2Z9NJW9MVN23NMSEGVHH714';

const AVATAR_COLORS = ['av-purple', 'av-orange', 'av-green', 'av-blue', 'av-pink', 'av-teal'];

/**
 * Facilitator URL for payment settlement
 */
let facilitatorUrl = process.env.FACILITATOR_URL ?? 'http://localhost:4000';

export function setFacilitatorUrl(url: string) {
  facilitatorUrl = url;
}

// ─── Row mapping helpers ──────────────────────────────────────────

function rowToTask(row: Record<string, unknown>): Task {
  return {
    id: row.id as string,
    title: row.title as string,
    description: row.description as string,
    category: row.category as TaskCategory,
    bounty: row.bounty as string,
    bountyMicroStx: row.bounty_micro_stx as string,
    status: row.status as TaskStatus,
    posterAddress: row.poster_address as string,
    assignedAgent: (row.assigned_agent as string) || undefined,
    result: (row.result as string) || undefined,
    paymentTxId: (row.payment_tx_id as string) || undefined,
    platformFee: (row.platform_fee as string) || undefined,
    platformWallet: (row.platform_wallet as string) || undefined,
    rejectionReason: (row.rejection_reason as string) || undefined,
    createdAt: (row.created_at as Date).toISOString(),
    updatedAt: (row.updated_at as Date).toISOString(),
    completedAt: row.completed_at ? (row.completed_at as Date).toISOString() : undefined,
  };
}

function rowToAgent(row: Record<string, unknown>): Agent {
  return {
    id: row.id as string,
    name: row.name as string,
    walletAddress: row.wallet_address as string,
    bio: (row.bio as string) || '',
    avatar: (row.avatar as string) || '',
    capabilities: (row.capabilities as TaskCategory[]) || [],
    tasksCompleted: row.tasks_completed as number,
    totalEarned: row.total_earned as string,
    avgRating: parseFloat(row.avg_rating as string) || 0,
    totalReviews: row.total_reviews as number,
    registeredAt: (row.registered_at as Date).toISOString(),
    lastActiveAt: (row.last_active_at as Date).toISOString(),
  };
}

function rowToBid(row: Record<string, unknown>): Bid {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    agentId: row.agent_id as string,
    amount: row.amount as string,
    message: row.message as string,
    estimatedTime: (row.estimated_time as string) || '',
    createdAt: (row.created_at as Date).toISOString(),
  };
}

function rowToReview(row: Record<string, unknown>): Review {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    agentId: row.agent_id as string,
    reviewerAddress: row.reviewer_address as string,
    rating: row.rating as number,
    comment: row.comment as string,
    createdAt: (row.created_at as Date).toISOString(),
  };
}

// ─── Task Operations ──────────────────────────────────────────

export async function createTask(req: CreateTaskRequest): Promise<Task> {
  const id = randomUUID().slice(0, 8);
  const now = new Date();

  const { rows } = await query(
    `INSERT INTO tasks (id, title, description, category, bounty, bounty_micro_stx, status, poster_address, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'open', $7, $8, $8)
     RETURNING *`,
    [id, req.title, req.description, req.category, req.bounty, stxToMicroStx(req.bounty), req.posterAddress, now]
  );

  console.log(`[TaskEngine] Created task ${id}: "${req.title}" (${req.bounty} STX)`);
  return rowToTask(rows[0]);
}

export async function getTask(id: string): Promise<Task | undefined> {
  const { rows } = await query('SELECT * FROM tasks WHERE id = $1', [id]);
  return rows.length ? rowToTask(rows[0]) : undefined;
}

export async function listTasks(filters?: {
  status?: TaskStatus;
  category?: TaskCategory;
  poster?: string;
}): Promise<Task[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let idx = 1;

  if (filters?.status) {
    conditions.push(`status = $${idx++}`);
    params.push(filters.status);
  }
  if (filters?.category) {
    conditions.push(`category = $${idx++}`);
    params.push(filters.category);
  }
  if (filters?.poster) {
    conditions.push(`poster_address = $${idx++}`);
    params.push(filters.poster);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await query(
    `SELECT * FROM tasks ${where} ORDER BY created_at DESC`,
    params
  );

  return rows.map(rowToTask);
}

export async function acceptTask(taskId: string, agentId: string): Promise<Task | { error: string }> {
  const task = await getTask(taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status !== 'open' && task.status !== 'bidding') return { error: `Task is ${task.status}, not open` };

  const agent = await getAgent(agentId);
  if (!agent) return { error: 'Agent not registered' };

  const now = new Date();
  const { rows } = await query(
    `UPDATE tasks SET status = 'assigned', assigned_agent = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
    [agentId, now, taskId]
  );
  await query('UPDATE agents SET last_active_at = $1 WHERE id = $2', [now, agentId]);

  console.log(`[TaskEngine] Task ${taskId} assigned to agent ${agent.name}`);
  return rowToTask(rows[0]);
}

export async function startTask(taskId: string, agentId: string): Promise<Task | { error: string }> {
  const task = await getTask(taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status !== 'assigned') return { error: `Task is ${task.status}, not assigned` };
  if (task.assignedAgent !== agentId) return { error: 'Not assigned to this agent' };

  const now = new Date();
  const { rows } = await query(
    `UPDATE tasks SET status = 'in-progress', updated_at = $1 WHERE id = $2 RETURNING *`,
    [now, taskId]
  );
  await query('UPDATE agents SET last_active_at = $1 WHERE id = $2', [now, agentId]);

  console.log(`[TaskEngine] Task ${taskId} started by agent ${agentId}`);
  return rowToTask(rows[0]);
}

export async function cancelTask(taskId: string, posterAddress: string): Promise<Task | { error: string }> {
  const task = await getTask(taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status !== 'open' && task.status !== 'bidding') return { error: `Task is ${task.status}, cannot cancel` };
  if (task.posterAddress !== posterAddress) return { error: 'Only the poster can cancel this task' };

  const now = new Date();
  const { rows } = await query(
    `UPDATE tasks SET status = 'cancelled', updated_at = $1 WHERE id = $2 RETURNING *`,
    [now, taskId]
  );

  console.log(`[TaskEngine] Task ${taskId} cancelled by poster`);
  return rowToTask(rows[0]);
}

export async function submitResult(
  taskId: string,
  agentId: string,
  result: string
): Promise<Task | { error: string }> {
  const task = await getTask(taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status !== 'assigned' && task.status !== 'in-progress') return { error: `Task is ${task.status}, not assigned or in-progress` };
  if (task.assignedAgent !== agentId) return { error: 'Not assigned to this agent' };

  const now = new Date();
  const { rows } = await query(
    `UPDATE tasks SET result = $1, status = 'submitted', updated_at = $2 WHERE id = $3 RETURNING *`,
    [result, now, taskId]
  );

  console.log(`[TaskEngine] Task ${taskId} result submitted by agent ${agentId}`);
  return rowToTask(rows[0]);
}

export async function rejectResult(taskId: string, posterAddress: string, reason: string): Promise<Task | { error: string }> {
  const task = await getTask(taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status !== 'submitted') return { error: `Task is ${task.status}, not submitted` };
  if (task.posterAddress !== posterAddress) return { error: 'Only the poster can reject submissions' };

  const now = new Date();
  const { rows } = await query(
    `UPDATE tasks SET status = 'assigned', rejection_reason = $1, result = NULL, updated_at = $2 WHERE id = $3 RETURNING *`,
    [reason, now, taskId]
  );

  console.log(`[TaskEngine] Task ${taskId} result rejected: ${reason}`);
  return rowToTask(rows[0]);
}

export async function approveTask(taskId: string): Promise<Task | { error: string }> {
  const task = await getTask(taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status !== 'submitted') return { error: `Task is ${task.status}, not submitted` };

  // Calculate platform fee using integer math (microSTX) to avoid floating-point errors
  const bountyMicro = BigInt(task.bountyMicroStx);
  const feeMicro = bountyMicro / 100n; // 1%
  const payoutMicro = bountyMicro - feeMicro;
  const platformFee = Number(feeMicro) / 1_000_000;
  const agentPayout = Number(payoutMicro) / 1_000_000;

  // For the MVP demo, simulate payment settlement via facilitator
  let paymentTxId = `sim_${randomUUID().slice(0, 12)}`;

  try {
    const settleResponse = await fetch(`${facilitatorUrl}/health`);
    if (settleResponse.ok) {
      console.log(`[TaskEngine] Facilitator available, payment would settle on-chain`);
      paymentTxId = `stx_${randomUUID().slice(0, 12)}`;
    }
  } catch {
    console.log(`[TaskEngine] Facilitator not available, using simulated payment`);
  }

  const now = new Date();

  // Use transaction to atomically update task + agent
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `UPDATE tasks
       SET status = 'completed', payment_tx_id = $1, platform_fee = $2,
           platform_wallet = $3, completed_at = $4, updated_at = $4
       WHERE id = $5 RETURNING *`,
      [paymentTxId, platformFee.toFixed(6), PLATFORM_WALLET, now, taskId]
    );

    if (task.assignedAgent) {
      await client.query(
        `UPDATE agents
         SET tasks_completed = tasks_completed + 1,
             total_earned = (CAST(total_earned AS NUMERIC) + $1)::TEXT,
             last_active_at = $2
         WHERE id = $3`,
        [agentPayout, now, task.assignedAgent]
      );
    }

    await client.query('COMMIT');

    console.log(`[TaskEngine] Task ${taskId} completed! Payment: ${paymentTxId} (${task.bounty} STX, fee: ${platformFee.toFixed(6)} STX)`);
    return rowToTask(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function closeTask(taskId: string, posterAddress: string): Promise<Task | { error: string }> {
  const task = await getTask(taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status !== 'completed') return { error: `Task is ${task.status}, not completed` };
  if (task.posterAddress !== posterAddress) return { error: 'Only the poster can close this task' };

  const now = new Date();
  const { rows } = await query(
    `UPDATE tasks SET status = 'closed', updated_at = $1 WHERE id = $2 RETURNING *`,
    [now, taskId]
  );

  console.log(`[TaskEngine] Task ${taskId} closed by poster`);
  return rowToTask(rows[0]);
}

// ─── Bidding Operations ──────────────────────────────────────────

export async function placeBid(taskId: string, req: PlaceBidRequest): Promise<Bid | { error: string }> {
  const task = await getTask(taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status !== 'open' && task.status !== 'bidding') return { error: `Task is ${task.status}, not accepting bids` };

  const agent = await getAgent(req.agentId);
  if (!agent) return { error: 'Agent not registered' };

  // Check if agent already bid on this task
  const { rows: existing } = await query(
    'SELECT id FROM bids WHERE task_id = $1 AND agent_id = $2',
    [taskId, req.agentId]
  );
  if (existing.length > 0) {
    return { error: 'Agent already placed a bid on this task' };
  }

  const id = randomUUID().slice(0, 8);
  const now = new Date();

  const { rows } = await query(
    `INSERT INTO bids (id, task_id, agent_id, amount, message, estimated_time, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [id, taskId, req.agentId, req.amount, req.message, req.estimatedTime, now]
  );

  // Move task to bidding status if it was open
  if (task.status === 'open') {
    await query(
      `UPDATE tasks SET status = 'bidding', updated_at = $1 WHERE id = $2`,
      [now, taskId]
    );
  }

  await query('UPDATE agents SET last_active_at = $1 WHERE id = $2', [now, req.agentId]);

  console.log(`[TaskEngine] Bid ${id} placed on task ${taskId} by agent ${agent.name} (${req.amount} STX)`);
  return rowToBid(rows[0]);
}

export async function listBids(taskId: string): Promise<Bid[]> {
  const { rows } = await query(
    'SELECT * FROM bids WHERE task_id = $1 ORDER BY CAST(amount AS NUMERIC) ASC',
    [taskId]
  );
  return rows.map(rowToBid);
}

export async function getBidCount(taskId: string): Promise<number> {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS count FROM bids WHERE task_id = $1',
    [taskId]
  );
  return rows[0].count;
}

export async function acceptBid(taskId: string, bidId: string, posterAddress: string): Promise<Task | { error: string }> {
  const task = await getTask(taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status !== 'open' && task.status !== 'bidding') return { error: `Task is ${task.status}, cannot accept bids` };
  if (task.posterAddress !== posterAddress) return { error: 'Only the poster can accept bids' };

  const { rows: bidRows } = await query('SELECT * FROM bids WHERE id = $1 AND task_id = $2', [bidId, taskId]);
  if (bidRows.length === 0) return { error: 'Bid not found' };

  const bid = rowToBid(bidRows[0]);
  const agent = await getAgent(bid.agentId);
  if (!agent) return { error: 'Agent not found' };

  const now = new Date();
  const { rows } = await query(
    `UPDATE tasks SET status = 'assigned', assigned_agent = $1, updated_at = $2 WHERE id = $3 RETURNING *`,
    [bid.agentId, now, taskId]
  );
  await query('UPDATE agents SET last_active_at = $1 WHERE id = $2', [now, bid.agentId]);

  console.log(`[TaskEngine] Bid ${bidId} accepted for task ${taskId}, assigned to ${agent.name}`);
  return rowToTask(rows[0]);
}

// ─── Agent Operations ──────────────────────────────────────────

export async function registerAgent(req: RegisterAgentRequest): Promise<Agent> {
  const id = randomUUID().slice(0, 8);
  const now = new Date();
  const letter = req.name.charAt(0).toUpperCase();
  const colorIdx = Math.abs(req.name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)) % AVATAR_COLORS.length;
  const avatar = `${letter}:${AVATAR_COLORS[colorIdx]}`;

  const { rows } = await query(
    `INSERT INTO agents (id, name, wallet_address, bio, avatar, capabilities, tasks_completed, total_earned, avg_rating, total_reviews, registered_at, last_active_at)
     VALUES ($1, $2, $3, $4, $5, $6, 0, '0.000000', 0, 0, $7, $7) RETURNING *`,
    [id, req.name, req.walletAddress, req.bio || '', avatar, req.capabilities, now]
  );

  console.log(`[TaskEngine] Registered agent ${id}: ${req.name}`);
  return rowToAgent(rows[0]);
}

export async function getAgent(id: string): Promise<Agent | undefined> {
  const { rows } = await query('SELECT * FROM agents WHERE id = $1', [id]);
  return rows.length ? rowToAgent(rows[0]) : undefined;
}

export async function listAgents(): Promise<Agent[]> {
  const { rows } = await query('SELECT * FROM agents ORDER BY tasks_completed DESC');
  return rows.map(rowToAgent);
}

export async function updateAgent(id: string, updates: { bio?: string; capabilities?: TaskCategory[] }): Promise<Agent | { error: string }> {
  const agent = await getAgent(id);
  if (!agent) return { error: 'Agent not found' };

  const now = new Date();
  const sets: string[] = ['last_active_at = $1'];
  const params: unknown[] = [now];
  let idx = 2;

  if (updates.bio !== undefined) {
    sets.push(`bio = $${idx++}`);
    params.push(updates.bio);
  }
  if (updates.capabilities) {
    sets.push(`capabilities = $${idx++}`);
    params.push(updates.capabilities);
  }

  params.push(id);
  const { rows } = await query(
    `UPDATE agents SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
    params
  );

  console.log(`[TaskEngine] Updated agent ${id}: ${agent.name}`);
  return rowToAgent(rows[0]);
}

// ─── Review Operations ──────────────────────────────────────────

export async function submitReview(agentId: string, req: SubmitReviewRequest): Promise<Review | { error: string }> {
  const agent = await getAgent(agentId);
  if (!agent) return { error: 'Agent not found' };

  const task = await getTask(req.taskId);
  if (!task) return { error: 'Task not found' };
  if (task.status !== 'completed' && task.status !== 'closed') return { error: 'Task not completed yet' };
  if (task.assignedAgent !== agentId) return { error: 'This agent was not assigned to this task' };
  if (task.posterAddress !== req.reviewerAddress) return { error: 'Only the task poster can review' };

  if (req.rating < 1 || req.rating > 5) return { error: 'Rating must be between 1 and 5' };
  if (!req.comment || req.comment.trim().length === 0) return { error: 'Comment is required' };

  const id = randomUUID().slice(0, 8);
  const now = new Date();

  // Use transaction to insert review + update agent avg_rating/total_reviews
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `INSERT INTO reviews (id, task_id, agent_id, reviewer_address, rating, comment, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, req.taskId, agentId, req.reviewerAddress, req.rating, req.comment, now]
    );

    // Recalculate average rating from all reviews
    const { rows: statsRows } = await client.query(
      'SELECT AVG(rating) AS avg_rating, COUNT(*)::int AS total_reviews FROM reviews WHERE agent_id = $1',
      [agentId]
    );

    await client.query(
      'UPDATE agents SET avg_rating = $1, total_reviews = $2 WHERE id = $3',
      [parseFloat(parseFloat(statsRows[0].avg_rating).toFixed(1)), statsRows[0].total_reviews, agentId]
    );

    await client.query('COMMIT');

    console.log(`[TaskEngine] Review for agent ${agent.name}: ${req.rating}/5`);
    return rowToReview(rows[0]);
  } catch (err: unknown) {
    await client.query('ROLLBACK');
    // Handle unique constraint violation (duplicate review)
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23505') {
      return { error: 'Already reviewed this task' };
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function listReviews(agentId: string): Promise<Review[]> {
  const { rows } = await query(
    'SELECT * FROM reviews WHERE agent_id = $1 ORDER BY created_at DESC',
    [agentId]
  );
  return rows.map(rowToReview);
}

// ─── Agent Profile ──────────────────────────────────────────

export async function getAgentProfile(id: string) {
  const agent = await getAgent(id);
  if (!agent) return undefined;

  const { rows } = await query(
    'SELECT * FROM reviews WHERE agent_id = $1 ORDER BY created_at DESC LIMIT 5',
    [id]
  );

  return {
    ...agent,
    recentReviews: rows.map(rowToReview),
  };
}

// ─── Stats ──────────────────────────────────────────

export async function getStats() {
  const { rows } = await query(`
    SELECT
      COUNT(*)::int AS total_tasks,
      COUNT(*) FILTER (WHERE status IN ('open', 'bidding'))::int AS open_tasks,
      COUNT(*) FILTER (WHERE status IN ('completed', 'closed'))::int AS completed_tasks,
      COALESCE(SUM(CAST(platform_fee AS NUMERIC)) FILTER (WHERE platform_fee IS NOT NULL), 0) AS total_platform_fees
    FROM tasks
  `);

  const { rows: agentRows } = await query(`
    SELECT
      COUNT(*)::int AS total_agents,
      COALESCE(SUM(CAST(total_earned AS NUMERIC)), 0) AS total_paid
    FROM agents
  `);

  return {
    totalTasks: rows[0].total_tasks,
    openTasks: rows[0].open_tasks,
    completedTasks: rows[0].completed_tasks,
    totalAgents: agentRows[0].total_agents,
    totalPaid: parseFloat(agentRows[0].total_paid).toFixed(6),
    totalPlatformFees: parseFloat(rows[0].total_platform_fees).toFixed(6),
    platformWallet: PLATFORM_WALLET,
  };
}

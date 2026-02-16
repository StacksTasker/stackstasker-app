/**
 * StacksTasker E2E Test — Full Task Lifecycle
 *
 * Exercises the entire happy path through the API:
 *   1. Poster (agent1) creates a task
 *   2. Two agents (agent2, agent3) bid on the task
 *   3. Poster accepts agent2's bid
 *   4. Agent2 starts and completes the task
 *   5. Agent2 submits the deliverable
 *   6. Poster approves → payment is made
 *   7. Poster closes the task
 *   8. Poster leaves a review for agent2
 */

import { test, expect, APIRequestContext } from '@playwright/test';

const API = 'http://localhost:3003';

// Wallet addresses (valid Stacks testnet format)
const POSTER_WALLET = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';
const AGENT2_WALLET = 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG';
const AGENT3_WALLET = 'ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC';

// Shared state across the ordered test steps
let agent2Id: string;
let agent3Id: string;
let taskId: string;
let agent2BidId: string;
let agent3BidId: string;

async function api(request: APIRequestContext) {
  return request;
}

test.describe.serial('Task Lifecycle — Full E2E', () => {

  // ─── Step 0: Health check ───────────────────────────────────

  test('API is healthy', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });

  // ─── Step 0b: Register agents ──────────────────────────────

  test('Register agent2 (bidder / worker)', async ({ request }) => {
    const res = await request.post(`${API}/agents/register`, {
      data: {
        name: 'ResearchBot-Alpha',
        walletAddress: AGENT2_WALLET,
        bio: 'Specialized in blockchain research and analysis',
        capabilities: ['web-scraping', 'smart-contract'],
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.name).toBe('ResearchBot-Alpha');
    agent2Id = body.id;
  });

  test('Register agent3 (competing bidder)', async ({ request }) => {
    const res = await request.post(`${API}/agents/register`, {
      data: {
        name: 'CodeMaster-9000',
        walletAddress: AGENT3_WALLET,
        bio: 'Full-stack coding agent with Clarity expertise',
        capabilities: ['coding', 'smart-contract'],
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.id).toBeTruthy();
    agent3Id = body.id;
  });

  // ─── Step 1: Poster creates a task ─────────────────────────

  test('Step 1 — Poster creates a task', async ({ request }) => {
    const res = await request.post(`${API}/tasks`, {
      data: {
        title: 'Analyze sBTC Bridge Security Architecture',
        description:
          'Review the sBTC bridge design and identify potential security risks. ' +
          'Cover the peg-in/peg-out flow, the signer set trust model, and threshold ' +
          'signature scheme. Provide a risk matrix and mitigation recommendations.',
        category: 'smart-contract',
        bounty: '0.020',
        posterAddress: POSTER_WALLET,
        network: 'testnet',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.status).toBe('open');
    expect(body.bounty).toBe('0.020');
    expect(body.posterAddress).toBe(POSTER_WALLET);
    taskId = body.id;
  });

  // ─── Step 2: Two agents bid on the task ────────────────────

  test('Step 2a — Agent2 bids on the task', async ({ request }) => {
    const res = await request.post(`${API}/tasks/${taskId}/bid`, {
      data: {
        agentId: agent2Id,
        amount: '0.018',
        message:
          'I have deep expertise in Bitcoin bridge security. I can deliver a ' +
          'comprehensive risk analysis within 2 hours covering all three areas.',
        estimatedTime: '2 hours',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.agentId).toBe(agent2Id);
    agent2BidId = body.id;

    // Task should now be in 'bidding' status
    const taskRes = await request.get(`${API}/tasks/${taskId}`);
    const task = await taskRes.json();
    expect(task.status).toBe('bidding');
  });

  test('Step 2b — Agent3 bids on the task', async ({ request }) => {
    const res = await request.post(`${API}/tasks/${taskId}/bid`, {
      data: {
        agentId: agent3Id,
        amount: '0.020',
        message:
          'I can provide a code-level security audit of the sBTC contracts ' +
          'along with the architecture review. Full report in 3 hours.',
        estimatedTime: '3 hours',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    agent3BidId = body.id;

    // Verify both bids are listed
    const bidsRes = await request.get(`${API}/tasks/${taskId}/bids`);
    const bids = await bidsRes.json();
    expect(bids.count).toBe(2);
  });

  // ─── Step 3: Poster accepts agent2's bid ───────────────────

  test('Step 3 — Poster accepts agent2 bid', async ({ request }) => {
    const res = await request.post(
      `${API}/tasks/${taskId}/bids/${agent2BidId}/accept`,
      {
        data: { posterAddress: POSTER_WALLET },
      }
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('assigned');
    expect(body.assignedAgent).toBe(agent2Id);
  });

  // ─── Step 4: Agent2 starts and works on the task ───────────

  test('Step 4a — Agent2 starts the task', async ({ request }) => {
    const res = await request.post(`${API}/tasks/${taskId}/start`, {
      data: { agentId: agent2Id },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('in-progress');
  });

  test('Step 4b — Poster and agent exchange messages', async ({ request }) => {
    // Poster sends a clarification
    const msg1 = await request.post(`${API}/tasks/${taskId}/messages`, {
      data: {
        senderAddress: POSTER_WALLET,
        body: 'Please also cover the liveness assumptions for the signer set.',
      },
    });
    expect(msg1.status()).toBe(201);

    // Agent acknowledges
    const msg2 = await request.post(`${API}/tasks/${taskId}/messages`, {
      data: {
        senderAddress: AGENT2_WALLET,
        body: 'Understood, I will include a section on liveness and availability guarantees.',
      },
    });
    expect(msg2.status()).toBe(201);

    // Verify thread has 2 messages
    const threadRes = await request.get(`${API}/tasks/${taskId}/messages`);
    const thread = await threadRes.json();
    expect(thread.count).toBe(2);
  });

  // ─── Step 5: Agent2 submits the deliverable ────────────────

  test('Step 5 — Agent2 submits result', async ({ request }) => {
    const result =
      '# sBTC Bridge Security Analysis\n\n' +
      '## 1. Peg-In/Peg-Out Flow\n' +
      'The sBTC bridge uses a federated peg model where a rotating signer set ' +
      'controls the BTC multisig wallet. Peg-in transactions require 7-of-10 ' +
      'signer confirmations before minting sBTC on Stacks.\n\n' +
      '## 2. Trust Model\n' +
      'The signer set operates under a threshold trust assumption: the system ' +
      'remains secure as long as at most 3 of 10 signers are compromised.\n\n' +
      '## 3. Risk Matrix\n' +
      '| Risk | Severity | Likelihood | Mitigation |\n' +
      '|------|----------|------------|------------|\n' +
      '| Signer collusion | Critical | Low | Economic penalties, slashing |\n' +
      '| Liveness failure | High | Medium | Timeout mechanisms, fallback signers |\n' +
      '| Smart contract bug | Critical | Low | Formal verification, audits |\n\n' +
      '## 4. Liveness Assumptions\n' +
      'The system requires at least 7 signers online to process withdrawals. ' +
      'If fewer than 7 are available, peg-out requests queue until quorum is restored.\n\n' +
      '## Recommendations\n' +
      '1. Implement signer rotation every 2 weeks\n' +
      '2. Add economic slashing for non-responsive signers\n' +
      '3. Commission formal verification of the threshold signature scheme';

    const res = await request.post(`${API}/tasks/${taskId}/submit`, {
      data: {
        agentId: agent2Id,
        result,
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('submitted');
    expect(body.result).toContain('sBTC Bridge Security Analysis');
    expect(body.result).toContain('Liveness Assumptions');
  });

  // ─── Step 6: Poster approves → task completed ─────────────

  test('Step 6 — Poster approves the result (simulated payment)', async ({ request }) => {
    const res = await request.post(`${API}/tasks/${taskId}/approve`, {
      data: { posterAddress: POSTER_WALLET },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.completedAt).toBeTruthy();
    // Simulated flow (no txId) should produce sim_ or stx_ prefix
    expect(body.paymentTxId).toMatch(/^(sim_|stx_)/);
  });

  // ─── Step 7: Verify payment was made ──────────────────────

  test('Step 7 — Payment is recorded', async ({ request }) => {
    const res = await request.get(`${API}/tasks/${taskId}`);
    const task = await res.json();

    expect(task.paymentTxId).toBeTruthy();
    // Accept simulated (sim_/stx_) or real on-chain tx IDs (64-char hex)
    expect(task.paymentTxId).toMatch(/^(sim_|stx_|[0-9a-f]{64})/);
    expect(task.platformFee).toBeTruthy();
    expect(parseFloat(task.platformFee)).toBeGreaterThan(0);

    // 1% of 0.020 = 0.000200
    expect(parseFloat(task.platformFee)).toBeCloseTo(0.0002, 4);

    // Verify agent2's earnings were updated
    const agentRes = await request.get(`${API}/agents/${agent2Id}`);
    const agent = await agentRes.json();
    expect(agent.tasksCompleted).toBe(1);
    expect(parseFloat(agent.totalEarned)).toBeGreaterThan(0);
  });

  // ─── Step 8: Poster closes the task ───────────────────────

  test('Step 8 — Poster closes the task', async ({ request }) => {
    const res = await request.post(`${API}/tasks/${taskId}/close`, {
      data: { posterAddress: POSTER_WALLET },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('closed');
  });

  // ─── Step 9: Poster leaves a review for agent2 ────────────

  test('Step 9 — Poster reviews agent2', async ({ request }) => {
    const res = await request.post(`${API}/agents/${agent2Id}/review`, {
      data: {
        taskId,
        reviewerAddress: POSTER_WALLET,
        rating: 5,
        comment:
          'Excellent work. Thorough security analysis with actionable recommendations. ' +
          'Delivered ahead of schedule and addressed all clarification requests.',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.rating).toBe(5);
    expect(body.agentId).toBe(agent2Id);

    // Verify agent's rating was updated
    const agentRes = await request.get(`${API}/agents/${agent2Id}`);
    const agent = await agentRes.json();
    expect(agent.avgRating).toBe(5);
    expect(agent.totalReviews).toBe(1);

    // Verify review appears in agent's review list
    const reviewsRes = await request.get(`${API}/agents/${agent2Id}/reviews`);
    const reviews = await reviewsRes.json();
    expect(reviews.count).toBe(1);
    expect(reviews.reviews[0].comment).toContain('Excellent work');
  });

  // ─── Final: Verify complete task state ─────────────────────

  test('Final — Task is fully settled', async ({ request }) => {
    const res = await request.get(`${API}/tasks/${taskId}`);
    const task = await res.json();

    expect(task.status).toBe('closed');
    expect(task.assignedAgent).toBe(agent2Id);
    expect(task.result).toContain('sBTC Bridge Security Analysis');
    expect(task.paymentTxId).toBeTruthy();
    expect(task.platformFee).toBeTruthy();
    expect(task.completedAt).toBeTruthy();

    // Verify platform stats reflect the completed task
    const statsRes = await request.get(`${API}/stats`);
    const stats = await statsRes.json();
    expect(stats.completedTasks).toBeGreaterThanOrEqual(1);
    expect(parseFloat(stats.totalPaid)).toBeGreaterThan(0);
  });
});

// ─── Payment Contract Config ──────────────────────────────────
test.describe('Payment Contract Config', () => {

  test('GET /config returns payment contract and platform wallet', async ({ request }) => {
    const res = await request.get(`${API}/config`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();

    // Payment contract config
    expect(body.paymentContract).toBeTruthy();
    expect(body.paymentContract.address).toBeTruthy();
    expect(body.paymentContract.address).toMatch(/^S[TPV]/);
    expect(body.paymentContract.name).toBe('stackstasker-payments');

    // Platform wallet addresses
    expect(body.platformWallet).toBeTruthy();
    expect(body.platformWallet.testnet).toMatch(/^ST/);
    expect(body.platformWallet.mainnet).toMatch(/^SP/);
  });
});

// ─── On-Chain Approval Flow (txId pass-through) ──────────────
test.describe.serial('On-Chain Approval — txId pass-through', () => {
  let onchainAgentId: string;
  let onchainTaskId: string;

  test('Setup — Register agent and create task', async ({ request }) => {
    // Register agent
    const agentRes = await request.post(`${API}/agents/register`, {
      data: {
        name: 'OnChainTestBot',
        walletAddress: 'ST3AM1A56AK2C1XAFJ4115ZSV26EB49BVQ10MGCS0',
        bio: 'Agent for on-chain payment test',
        capabilities: ['coding'],
      },
    });
    expect(agentRes.ok()).toBeTruthy();
    onchainAgentId = (await agentRes.json()).id;

    // Create task
    const taskRes = await request.post(`${API}/tasks`, {
      data: {
        title: 'On-chain payment test task',
        description: 'Testing that real txId flows through the approve endpoint correctly.',
        category: 'coding',
        bounty: '1.000',
        posterAddress: POSTER_WALLET,
        network: 'testnet',
      },
    });
    expect(taskRes.status()).toBe(201);
    onchainTaskId = (await taskRes.json()).id;
  });

  test('Setup — Agent accepts, starts, and submits', async ({ request }) => {
    await request.post(`${API}/tasks/${onchainTaskId}/accept`, {
      data: { agentId: onchainAgentId },
    });
    await request.post(`${API}/tasks/${onchainTaskId}/start`, {
      data: { agentId: onchainAgentId },
    });
    const submitRes = await request.post(`${API}/tasks/${onchainTaskId}/submit`, {
      data: { agentId: onchainAgentId, result: 'Test deliverable for on-chain payment.' },
    });
    expect(submitRes.ok()).toBeTruthy();
    const body = await submitRes.json();
    expect(body.status).toBe('submitted');
  });

  test('Approve with real txId — records on-chain tx', async ({ request }) => {
    const fakeTxId = 'abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234abcd1234';

    const res = await request.post(`${API}/tasks/${onchainTaskId}/approve`, {
      data: { posterAddress: POSTER_WALLET, txId: fakeTxId },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.paymentTxId).toBe(fakeTxId);
    expect(body.completedAt).toBeTruthy();

    // Verify fee calculation: 1% of 1.000 = 0.010000
    expect(parseFloat(body.platformFee)).toBeCloseTo(0.01, 4);
  });

  test('Verify on-chain task state', async ({ request }) => {
    const res = await request.get(`${API}/tasks/${onchainTaskId}`);
    const task = await res.json();

    expect(task.status).toBe('completed');
    // Real tx ID should be stored as-is (not sim_ or stx_)
    expect(task.paymentTxId).not.toMatch(/^(sim_|stx_)/);
    expect(task.paymentTxId).toMatch(/^[0-9a-f]{64}$/);

    // Verify agent earnings updated
    const agentRes = await request.get(`${API}/agents/${onchainAgentId}`);
    const agent = await agentRes.json();
    expect(agent.tasksCompleted).toBe(1);
    // Agent payout = 1.000 - 0.01 = 0.99
    expect(parseFloat(agent.totalEarned)).toBeCloseTo(0.99, 2);
  });
});

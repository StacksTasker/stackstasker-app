/**
 * StacksTasker Mainnet E2E Test — Real On-Chain Payment
 *
 * Full task lifecycle on mainnet with a real STX payment via the
 * stackstasker-payments smart contract.
 *
 * Uses the platform wallet (SPV4JB...) as the poster, paying 1 STX
 * through the deployed contract on mainnet.
 *
 * Prerequisites:
 *   - Local API running on http://localhost:3003
 *   - Contract deployed at SPV4JB5CZWFD8BN9XMDV0F4KTS44BKRZ8TEM307V.stackstasker-payments
 *   - Platform wallet has sufficient STX balance (>1 STX)
 */

import { test, expect } from '@playwright/test';
import {
  makeContractCall,
  broadcastTransaction,
  AnchorMode,
  PostConditionMode,
  principalCV,
  uintCV,
} from '@stacks/transactions';

const API = 'http://localhost:3003';

// Mainnet wallets
const POSTER_WALLET = 'SPV4JB5CZWFD8BN9XMDV0F4KTS44BKRZ8TEM307V';
const POSTER_KEY = '81879ab1e8fb6c988486e2b0491f8e74b1c401e11ffdc0989fada068822e91ae01';
const AGENT_WALLET = 'SPRG5SJWZ4TE23RJY2Z9NJW9MVN23NMSEGVHH714';
// Platform wallet must differ from poster (Clarity stx-transfer? disallows self-transfers)
const PLATFORM_WALLET = 'SPRG5SJWZ4TE23RJY2Z9NJW9MVN23NMSEGVHH714';

// Contract details
const CONTRACT_ADDRESS = 'SPV4JB5CZWFD8BN9XMDV0F4KTS44BKRZ8TEM307V';
const CONTRACT_NAME = 'stackstasker-payments';

// Shared state
let agentId: string;
let taskId: string;
let bidId: string;
let paymentTxId: string;

// Longer timeout for on-chain operations
test.setTimeout(120_000);

test.describe.serial('Mainnet E2E — Real On-Chain Payment', () => {

  // ─── Step 0: Health check ─────────────────────────────────

  test('API is healthy', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('healthy');
  });

  // ─── Step 1: Verify contract is deployed ──────────────────

  test('Contract is deployed on mainnet', async () => {
    const res = await fetch(
      `https://api.hiro.so/v2/contracts/interface/${CONTRACT_ADDRESS}/${CONTRACT_NAME}`
    );
    expect(res.ok).toBeTruthy();
    const iface = await res.json();
    // Should have the pay-task function
    const payTask = iface.functions.find(
      (f: { name: string }) => f.name === 'pay-task'
    );
    expect(payTask).toBeTruthy();
  });

  // ─── Step 2: Verify wallet has sufficient balance ─────────

  test('Poster wallet has sufficient STX', async () => {
    const res = await fetch(
      `https://api.hiro.so/extended/v1/address/${POSTER_WALLET}/stx`
    );
    expect(res.ok).toBeTruthy();
    const data = await res.json();
    const balanceStx = parseInt(data.balance) / 1_000_000;
    console.log(`Poster wallet balance: ${balanceStx} STX`);
    // Need at least 1 STX for bounty + fees
    expect(balanceStx).toBeGreaterThan(1.1);
  });

  // ─── Step 3: Register agent on mainnet ────────────────────

  test('Register mainnet agent', async ({ request }) => {
    const res = await request.post(`${API}/agents/register`, {
      data: {
        name: 'MainnetTestAgent-E2E',
        walletAddress: AGENT_WALLET,
        bio: 'E2E test agent for mainnet payment verification',
        capabilities: ['coding', 'other'],
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.id).toBeTruthy();
    agentId = body.id;
  });

  // ─── Step 4: Poster creates a mainnet task (1 STX) ────────

  test('Poster creates a 1 STX mainnet task', async ({ request }) => {
    const res = await request.post(`${API}/tasks`, {
      data: {
        title: 'Mainnet E2E Test — Smart Contract Verification',
        description:
          'Automated e2e test task to verify the full mainnet payment flow. ' +
          'This task tests the stackstasker-payments contract with a real 1 STX bounty.',
        category: 'coding',
        bounty: '1.000',
        posterAddress: POSTER_WALLET,
        network: 'mainnet',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    expect(body.status).toBe('open');
    expect(body.bounty).toBe('1.000');
    expect(body.network).toBe('mainnet');
    taskId = body.id;
  });

  // ─── Step 5: Agent bids on the task ───────────────────────

  test('Agent bids on the task', async ({ request }) => {
    const res = await request.post(`${API}/tasks/${taskId}/bid`, {
      data: {
        agentId,
        amount: '1.000',
        message: 'E2E test bid — will complete immediately for payment verification.',
        estimatedTime: '1 minute',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.id).toBeTruthy();
    bidId = body.id;

    // Task should now be bidding
    const taskRes = await request.get(`${API}/tasks/${taskId}`);
    const task = await taskRes.json();
    expect(task.status).toBe('bidding');
  });

  // ─── Step 6: Poster accepts the bid ───────────────────────

  test('Poster accepts the bid', async ({ request }) => {
    const res = await request.post(
      `${API}/tasks/${taskId}/bids/${bidId}/accept`,
      { data: { posterAddress: POSTER_WALLET } }
    );
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('assigned');
    expect(body.assignedAgent).toBe(agentId);
  });

  // ─── Step 7: Agent starts and submits ─────────────────────

  test('Agent starts the task', async ({ request }) => {
    const res = await request.post(`${API}/tasks/${taskId}/start`, {
      data: { agentId },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('in-progress');
  });

  test('Agent submits result', async ({ request }) => {
    const res = await request.post(`${API}/tasks/${taskId}/submit`, {
      data: {
        agentId,
        result:
          'Mainnet E2E Test Result\n\n' +
          'Verified the stackstasker-payments contract is deployed and callable.\n' +
          'Contract: SPV4JB5CZWFD8BN9XMDV0F4KTS44BKRZ8TEM307V.stackstasker-payments\n' +
          'Function: pay-task splits bounty 99/1 between agent and platform.\n' +
          'Test passed successfully.',
      },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('submitted');
  });

  // ─── Step 8: Real on-chain payment via smart contract ─────

  test('Build and broadcast real payment transaction', async () => {
    const bountyMicroStx = 1_000_000; // 1 STX

    // Fetch nonce
    const nonceRes = await fetch(
      `https://api.hiro.so/extended/v1/address/${POSTER_WALLET}/nonces`
    );
    const nonceData = await nonceRes.json();
    const nonce = nonceData.possible_next_nonce;
    console.log(`Using nonce: ${nonce}`);

    // Build contract call with proper Clarity values
    const transaction = await makeContractCall({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName: 'pay-task',
      functionArgs: [
        principalCV(AGENT_WALLET),
        principalCV(PLATFORM_WALLET),
        uintCV(bountyMicroStx),
      ],
      senderKey: POSTER_KEY,
      nonce,
      fee: 10000, // 0.01 STX fee
      network: 'mainnet',
      anchorMode: AnchorMode.Any,
      postConditionMode: PostConditionMode.Allow,
    });

    console.log('Broadcasting payment transaction...');
    const result = await broadcastTransaction({ transaction, network: 'mainnet' });
    console.log('Broadcast result:', JSON.stringify(result));

    expect(result.txid).toBeTruthy();
    paymentTxId = result.txid;
    console.log(`Payment TX: ${paymentTxId}`);
    console.log(`Explorer: https://explorer.hiro.so/txid/${paymentTxId}?chain=mainnet`);
  });

  // ─── Step 9: Approve task with real txId ──────────────────

  test('Approve task with real on-chain txId', async ({ request }) => {
    const res = await request.post(`${API}/tasks/${taskId}/approve`, {
      data: { posterAddress: POSTER_WALLET, txId: paymentTxId },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('completed');
    expect(body.paymentTxId).toBe(paymentTxId);
    expect(body.completedAt).toBeTruthy();

    // Verify fee calculation: 1% of 1.000 = 0.010000
    expect(parseFloat(body.platformFee)).toBeCloseTo(0.01, 4);
  });

  // ─── Step 10: Verify final state ─────────────────────────

  test('Verify completed task state', async ({ request }) => {
    const res = await request.get(`${API}/tasks/${taskId}`);
    const task = await res.json();

    expect(task.status).toBe('completed');
    expect(task.assignedAgent).toBe(agentId);
    expect(task.network).toBe('mainnet');
    expect(task.result).toContain('Mainnet E2E Test Result');

    // Real tx ID should not be simulated
    expect(task.paymentTxId).not.toMatch(/^(sim_|stx_)/);
    expect(task.paymentTxId).toBeTruthy();

    // Fee breakdown
    expect(task.platformFee).toBeTruthy();
    expect(parseFloat(task.platformFee)).toBeCloseTo(0.01, 4);
  });

  test('Verify agent earnings updated', async ({ request }) => {
    const res = await request.get(`${API}/agents/${agentId}`);
    const agent = await res.json();

    expect(agent.tasksCompleted).toBeGreaterThanOrEqual(1);
    expect(parseFloat(agent.totalEarned)).toBeGreaterThanOrEqual(0.99);
  });

  test('Verify transaction on Hiro explorer API', async () => {
    // Give the mempool a moment
    await new Promise((r) => setTimeout(r, 3000));

    const res = await fetch(
      `https://api.hiro.so/extended/v1/tx/0x${paymentTxId}`
    );
    expect(res.ok).toBeTruthy();
    const tx = await res.json();

    console.log(`TX status: ${tx.tx_status}`);
    // Should be pending or success (might still be in mempool)
    expect(['pending', 'success']).toContain(tx.tx_status);
    expect(tx.tx_type).toBe('contract_call');
    expect(tx.contract_call.contract_id).toBe(
      `${CONTRACT_ADDRESS}.${CONTRACT_NAME}`
    );
    expect(tx.contract_call.function_name).toBe('pay-task');
  });

  // ─── Step 11: Poster closes and reviews ───────────────────

  test('Poster closes the task', async ({ request }) => {
    const res = await request.post(`${API}/tasks/${taskId}/close`, {
      data: { posterAddress: POSTER_WALLET },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('closed');
  });

  test('Poster leaves a review', async ({ request }) => {
    const res = await request.post(`${API}/agents/${agentId}/review`, {
      data: {
        taskId,
        reviewerAddress: POSTER_WALLET,
        rating: 5,
        comment: 'Mainnet E2E test completed successfully. Payment verified on-chain.',
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.rating).toBe(5);
  });

  // ─── Final: Platform stats ────────────────────────────────

  test('Mainnet stats reflect the completed task', async ({ request }) => {
    const res = await request.get(`${API}/stats?network=mainnet`);
    expect(res.ok()).toBeTruthy();
    const stats = await res.json();
    expect(stats.completedTasks).toBeGreaterThanOrEqual(1);
    expect(parseFloat(stats.totalPaid)).toBeGreaterThanOrEqual(1);
  });
});

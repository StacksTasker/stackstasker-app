// @x402/stacks - Unit tests for server-side payment verification

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyPayment } from './server.js';
import { CHAIN_IDS } from './types.js';
import type { StacksPaymentPayload, StacksPaymentRequirement } from './types.js';

function makePayload(overrides: Partial<StacksPaymentPayload> = {}): StacksPaymentPayload {
  return {
    scheme: 'exact',
    network: 'stacks',
    chainId: CHAIN_IDS.TESTNET,
    recipient: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    amount: '5000',
    asset: 'STX',
    nonce: 1,
    signature: 'test-signature-hex',
    publicKey: 'test-public-key-hex',
    ...overrides,
  };
}

function makeRequirement(overrides: Partial<StacksPaymentRequirement> = {}): StacksPaymentRequirement {
  return {
    scheme: 'exact',
    network: 'stacks',
    chainId: CHAIN_IDS.TESTNET,
    recipient: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    amount: '5000',
    asset: 'STX',
    ...overrides,
  };
}

describe('verifyPayment', () => {
  it('returns valid for matching payload and requirement', async () => {
    const result = await verifyPayment(makePayload(), makeRequirement());
    assert.equal(result.valid, true);
    assert.ok(result.details);
    assert.equal(result.details!.amount, '5000');
    assert.equal(result.details!.recipient, 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
    assert.equal(result.details!.nonce, 1);
  });

  it('rejects network mismatch', async () => {
    const payload = { ...makePayload(), network: 'bitcoin' as any };
    const result = await verifyPayment(payload, makeRequirement());
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'Network mismatch');
  });

  it('rejects chain ID mismatch', async () => {
    const payload = makePayload({ chainId: CHAIN_IDS.MAINNET });
    const requirement = makeRequirement({ chainId: CHAIN_IDS.TESTNET });
    const result = await verifyPayment(payload, requirement);
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'Chain ID mismatch');
  });

  it('rejects recipient mismatch', async () => {
    const payload = makePayload({ recipient: 'ST1DIFFERENT_ADDRESS_COMPLETELY_HERE00' });
    const result = await verifyPayment(payload, makeRequirement());
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'Recipient mismatch');
  });

  it('rejects insufficient amount', async () => {
    const payload = makePayload({ amount: '1000' });
    const requirement = makeRequirement({ amount: '5000' });
    const result = await verifyPayment(payload, requirement);
    assert.equal(result.valid, false);
    assert.match(result.reason!, /Insufficient amount/);
  });

  it('accepts exact amount', async () => {
    const payload = makePayload({ amount: '5000' });
    const requirement = makeRequirement({ amount: '5000' });
    const result = await verifyPayment(payload, requirement);
    assert.equal(result.valid, true);
  });

  it('accepts overpayment', async () => {
    const payload = makePayload({ amount: '10000' });
    const requirement = makeRequirement({ amount: '5000' });
    const result = await verifyPayment(payload, requirement);
    assert.equal(result.valid, true);
  });

  it('rejects asset mismatch', async () => {
    const payload = makePayload({ asset: 'BTC' });
    const result = await verifyPayment(payload, makeRequirement());
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'Asset mismatch');
  });

  it('rejects expired payment', async () => {
    const payload = makePayload({ expiresAt: Date.now() - 60000 });
    const result = await verifyPayment(payload, makeRequirement());
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'Payment expired');
  });

  it('accepts non-expired payment', async () => {
    const payload = makePayload({ expiresAt: Date.now() + 60000 });
    const result = await verifyPayment(payload, makeRequirement());
    assert.equal(result.valid, true);
  });

  it('accepts payment without expiry', async () => {
    const payload = makePayload();
    delete payload.expiresAt;
    const result = await verifyPayment(payload, makeRequirement());
    assert.equal(result.valid, true);
  });

  it('handles large amounts correctly with BigInt', async () => {
    const payload = makePayload({ amount: '999999999999999' });
    const requirement = makeRequirement({ amount: '999999999999999' });
    const result = await verifyPayment(payload, requirement);
    assert.equal(result.valid, true);
  });

  it('rejects when scheme mismatches', async () => {
    const payload = { ...makePayload(), scheme: 'subscription' as any };
    const result = await verifyPayment(payload, makeRequirement());
    assert.equal(result.valid, false);
    assert.equal(result.reason, 'Scheme mismatch');
  });
});

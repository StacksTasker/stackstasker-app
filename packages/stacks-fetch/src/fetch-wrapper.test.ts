// @x402/stacks-fetch - Integration tests for fetch wrapper

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { wrapFetch } from './index.js';
import type { X402FetchConfig } from './index.js';

const dummyConfig: X402FetchConfig = {
  wallet: { privateKey: 'a'.repeat(64) },
  network: { type: 'testnet' },
};

// ─── Non-402 passthrough ───────────────────────────────

describe('wrapFetch - non-402 responses', () => {
  it('passes through 200 responses unchanged', async () => {
    const mockResponse = new Response('ok', { status: 200 });
    const mockFetch = async () => mockResponse;

    const wrapped = wrapFetch(mockFetch as typeof fetch, dummyConfig);
    const result = await wrapped('http://example.com');

    assert.equal(result.status, 200);
  });

  it('passes through 404 responses unchanged', async () => {
    const mockResponse = new Response('not found', { status: 404 });
    const mockFetch = async () => mockResponse;

    const wrapped = wrapFetch(mockFetch as typeof fetch, dummyConfig);
    const result = await wrapped('http://example.com/missing');

    assert.equal(result.status, 404);
  });

  it('passes through 500 responses unchanged', async () => {
    const mockResponse = new Response('error', { status: 500 });
    const mockFetch = async () => mockResponse;

    const wrapped = wrapFetch(mockFetch as typeof fetch, dummyConfig);
    const result = await wrapped('http://example.com/error');

    assert.equal(result.status, 500);
  });

  it('delegates to the provided fetch function', async () => {
    let callCount = 0;
    let capturedUrl = '';
    const mockFetch = async (input: string | URL | Request) => {
      callCount++;
      capturedUrl = typeof input === 'string' ? input : '';
      return new Response('ok', { status: 200 });
    };

    const wrapped = wrapFetch(mockFetch as typeof fetch, dummyConfig);
    await wrapped('http://example.com/api/data');

    assert.equal(callCount, 1);
    assert.equal(capturedUrl, 'http://example.com/api/data');
  });

  it('forwards request init options', async () => {
    let capturedInit: RequestInit | undefined;
    const mockFetch = async (_input: any, init?: RequestInit) => {
      capturedInit = init;
      return new Response('ok', { status: 200 });
    };

    const wrapped = wrapFetch(mockFetch as typeof fetch, dummyConfig);
    await wrapped('http://example.com', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"test":true}',
    });

    assert.equal(capturedInit?.method, 'POST');
    assert.deepEqual(capturedInit?.headers, { 'Content-Type': 'application/json' });
    assert.equal(capturedInit?.body, '{"test":true}');
  });
});

// ─── 402 without payment header ────────────────────────

describe('wrapFetch - 402 without X-Payment-Required header', () => {
  it('returns the original 402 response', async () => {
    const mockResponse = new Response('payment required', { status: 402 });
    const mockFetch = async () => mockResponse;

    const wrapped = wrapFetch(mockFetch as typeof fetch, dummyConfig);
    const result = await wrapped('http://example.com/paid');

    assert.equal(result.status, 402);
  });
});

// ─── 402 with amount exceeding max ─────────────────────

describe('wrapFetch - amount exceeds maxAutoPayAmount', () => {
  it('returns 402 without paying when amount exceeds limit', async () => {
    const requirement = {
      scheme: 'exact',
      network: 'stacks',
      chainId: 2147483648,
      recipient: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      amount: '50000000', // 50 STX in microSTX
      asset: 'STX',
    };
    const encoded = Buffer.from(JSON.stringify(requirement)).toString('base64');
    const mockResponse = new Response('payment required', {
      status: 402,
      headers: { 'x-payment-required': encoded },
    });

    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return mockResponse;
    };

    const config = { ...dummyConfig, maxAutoPayAmount: '1000000' }; // 1 STX max
    const wrapped = wrapFetch(mockFetch as typeof fetch, config);
    const result = await wrapped('http://example.com/expensive');

    assert.equal(result.status, 402);
    assert.equal(callCount, 1, 'should not retry when amount exceeds limit');
  });

  it('respects custom maxAutoPayAmount', async () => {
    const requirement = {
      scheme: 'exact',
      network: 'stacks',
      chainId: 2147483648,
      recipient: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      amount: '500', // very small amount
      asset: 'STX',
    };
    const encoded = Buffer.from(JSON.stringify(requirement)).toString('base64');
    const mockResponse = new Response('payment required', {
      status: 402,
      headers: { 'x-payment-required': encoded },
    });

    let callCount = 0;
    const mockFetch = async () => {
      callCount++;
      return mockResponse;
    };

    // Set max to 100, amount is 500 -> should not pay
    const config = { ...dummyConfig, maxAutoPayAmount: '100' };
    const wrapped = wrapFetch(mockFetch as typeof fetch, config);
    const result = await wrapped('http://example.com');

    assert.equal(result.status, 402);
    assert.equal(callCount, 1);
  });
});

// ─── 402 with invalid payment requirement ──────────────

describe('wrapFetch - invalid payment requirement header', () => {
  it('returns original response when header cannot be decoded', async () => {
    const mockResponse = new Response('payment required', {
      status: 402,
      headers: { 'x-payment-required': 'not-valid-json-at-all' },
    });
    const mockFetch = async () => mockResponse;

    const wrapped = wrapFetch(mockFetch as typeof fetch, dummyConfig);
    const result = await wrapped('http://example.com');

    assert.equal(result.status, 402);
  });
});

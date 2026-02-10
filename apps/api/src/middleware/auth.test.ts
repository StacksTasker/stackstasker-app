// StacksTasker API - Unit tests for wallet auth middleware

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { verifyWalletSignature, optionalWalletAuth } from './auth.js';

// ─── Mock Express objects ──────────────────────────────

function createReq(headers: Record<string, string> = {}) {
  return { headers } as any;
}

function createRes() {
  const res: any = {
    statusCode: 200,
    _body: null as any,
    status(code: number) { res.statusCode = code; return res; },
    json(data: any) { res._body = data; return res; },
  };
  return res;
}

function createNext() {
  let called = false;
  const fn = () => { called = true; };
  fn.wasCalled = () => called;
  return fn;
}

// ─── verifyWalletSignature ─────────────────────────────

describe('verifyWalletSignature', () => {
  it('calls next() when no auth headers are present', () => {
    const req = createReq({});
    const res = createRes();
    const next = createNext();

    verifyWalletSignature(req, res, next);

    assert.equal(next.wasCalled(), true);
  });

  it('rejects when only address header is present', () => {
    const req = createReq({
      'x-wallet-address': 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    });
    const res = createRes();
    const next = createNext();

    verifyWalletSignature(req, res, next);

    assert.equal(next.wasCalled(), false);
    assert.equal(res.statusCode, 401);
    assert.match(res._body.error, /Missing authentication headers/);
  });

  it('rejects when only signature header is present', () => {
    const req = createReq({
      'x-wallet-signature': 'sig_test',
      'x-wallet-timestamp': new Date().toISOString(),
    });
    const res = createRes();
    const next = createNext();

    verifyWalletSignature(req, res, next);

    assert.equal(next.wasCalled(), false);
    assert.equal(res.statusCode, 401);
  });

  it('rejects when timestamp is missing', () => {
    const req = createReq({
      'x-wallet-address': 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      'x-wallet-signature': 'sig_test',
    });
    const res = createRes();
    const next = createNext();

    verifyWalletSignature(req, res, next);

    assert.equal(next.wasCalled(), false);
    assert.equal(res.statusCode, 401);
  });

  it('rejects expired timestamp (older than 5 minutes)', () => {
    const oldTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const req = createReq({
      'x-wallet-address': 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      'x-wallet-signature': 'sig_test',
      'x-wallet-timestamp': oldTime,
    });
    const res = createRes();
    const next = createNext();

    verifyWalletSignature(req, res, next);

    assert.equal(next.wasCalled(), false);
    assert.equal(res.statusCode, 401);
    assert.match(res._body.error, /expired/);
  });

  it('rejects future timestamp beyond 5 minutes', () => {
    const futureTime = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const req = createReq({
      'x-wallet-address': 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      'x-wallet-signature': 'sig_test',
      'x-wallet-timestamp': futureTime,
    });
    const res = createRes();
    const next = createNext();

    verifyWalletSignature(req, res, next);

    assert.equal(next.wasCalled(), false);
    assert.equal(res.statusCode, 401);
  });

  it('rejects invalid STX address format', () => {
    const req = createReq({
      'x-wallet-address': 'BT1INVALID_NOT_STX_ADDRESS',
      'x-wallet-signature': 'sig_test',
      'x-wallet-timestamp': new Date().toISOString(),
    });
    const res = createRes();
    const next = createNext();

    verifyWalletSignature(req, res, next);

    assert.equal(next.wasCalled(), false);
    assert.equal(res.statusCode, 401);
    assert.match(res._body.error, /Invalid STX wallet address/);
  });

  it('passes valid testnet auth headers (ST prefix)', () => {
    const req = createReq({
      'x-wallet-address': 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      'x-wallet-signature': 'sig_ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM_test',
      'x-wallet-timestamp': new Date().toISOString(),
    });
    const res = createRes();
    const next = createNext();

    verifyWalletSignature(req, res, next);

    assert.equal(next.wasCalled(), true);
    assert.equal((req as any).walletAddress, 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
  });

  it('passes valid mainnet auth headers (SP prefix)', () => {
    const req = createReq({
      'x-wallet-address': 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      'x-wallet-signature': 'sig_test',
      'x-wallet-timestamp': new Date().toISOString(),
    });
    const res = createRes();
    const next = createNext();

    verifyWalletSignature(req, res, next);

    assert.equal(next.wasCalled(), true);
    assert.equal((req as any).walletAddress, 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
  });

  it('rejects invalid timestamp format', () => {
    const req = createReq({
      'x-wallet-address': 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      'x-wallet-signature': 'sig_test',
      'x-wallet-timestamp': 'not-a-date',
    });
    const res = createRes();
    const next = createNext();

    verifyWalletSignature(req, res, next);

    assert.equal(next.wasCalled(), false);
    assert.equal(res.statusCode, 401);
  });
});

// ─── optionalWalletAuth ────────────────────────────────

describe('optionalWalletAuth', () => {
  it('always calls next() regardless of headers', () => {
    const req = createReq({});
    const res = createRes();
    const next = createNext();

    optionalWalletAuth(req, res, next);

    assert.equal(next.wasCalled(), true);
  });

  it('attaches wallet address for valid ST address', () => {
    const req = createReq({
      'x-wallet-address': 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    });
    const res = createRes();

    optionalWalletAuth(req, res, () => {});

    assert.equal((req as any).walletAddress, 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
  });

  it('attaches wallet address for valid SP address', () => {
    const req = createReq({
      'x-wallet-address': 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
    });
    const res = createRes();

    optionalWalletAuth(req, res, () => {});

    assert.equal((req as any).walletAddress, 'SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
  });

  it('does not attach wallet for invalid address', () => {
    const req = createReq({
      'x-wallet-address': 'BT1INVALID',
    });
    const res = createRes();

    optionalWalletAuth(req, res, () => {});

    assert.equal((req as any).walletAddress, undefined);
  });

  it('does not attach wallet when header is missing', () => {
    const req = createReq({});
    const res = createRes();

    optionalWalletAuth(req, res, () => {});

    assert.equal((req as any).walletAddress, undefined);
  });
});

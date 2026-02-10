// @x402/stacks-express - Integration tests for payment middleware

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { paymentMiddleware } from './index.js';
import type { RouteConfig, PaymentMiddlewareOptions } from './index.js';

// ─── Mock Express objects ──────────────────────────────

function createReq(method: string, path: string, headers: Record<string, string> = {}) {
  return { method, path, headers } as any;
}

function createRes() {
  const res: any = {
    statusCode: 200,
    _headers: {} as Record<string, string>,
    _body: null as any,
    status(code: number) { res.statusCode = code; return res; },
    set(key: string, value: string) { res._headers[key] = value; return res; },
    json(data: any) { res._body = data; return res; },
  };
  return res;
}

// ─── Test setup ────────────────────────────────────────

const RECIPIENT = 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM';

const routes: Record<string, RouteConfig> = {
  'GET /paid-endpoint': { price: '0.001', description: 'Access paid data' },
  'POST /submit': { price: '0.01', description: 'Submit content' },
};

const options: PaymentMiddlewareOptions = {
  recipientAddress: RECIPIENT,
  network: { type: 'testnet' },
  settleImmediately: false,
};

// ─── Tests ─────────────────────────────────────────────

describe('paymentMiddleware', () => {
  it('passes through routes not in config', async () => {
    const middleware = paymentMiddleware(routes, options);
    const req = createReq('GET', '/free-endpoint');
    const res = createRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
    assert.equal(res.statusCode, 200);
  });

  it('returns 402 for configured route without payment header', async () => {
    const middleware = paymentMiddleware(routes, options);
    const req = createReq('GET', '/paid-endpoint');
    const res = createRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 402);
    assert.equal(res._body.error, 'Payment Required');
  });

  it('includes X-Payment-Required header in 402 response', async () => {
    const middleware = paymentMiddleware(routes, options);
    const req = createReq('GET', '/paid-endpoint');
    const res = createRes();

    await middleware(req, res, () => {});

    assert.ok(res._headers['X-Payment-Required']);
    assert.equal(typeof res._headers['X-Payment-Required'], 'string');
    // Should be base64 encoded
    const decoded = JSON.parse(
      Buffer.from(res._headers['X-Payment-Required'], 'base64').toString('utf-8')
    );
    assert.equal(decoded.recipient, RECIPIENT);
    assert.equal(decoded.scheme, 'exact');
    assert.equal(decoded.network, 'stacks');
  });

  it('includes payment info in 402 response body', async () => {
    const middleware = paymentMiddleware(routes, options);
    const req = createReq('GET', '/paid-endpoint');
    const res = createRes();

    await middleware(req, res, () => {});

    assert.equal(res._body.requirement.amount, '0.001');
    assert.equal(res._body.requirement.asset, 'STX');
    assert.equal(res._body.requirement.recipient, RECIPIENT);
    assert.equal(res._body.message, 'Access paid data');
  });

  it('returns 400 for invalid payment header', async () => {
    const middleware = paymentMiddleware(routes, options);
    const req = createReq('GET', '/paid-endpoint', {
      'x-payment': 'not-valid-json-base64',
    });
    const res = createRes();

    await middleware(req, res, () => {});

    assert.equal(res.statusCode, 400);
    assert.equal(res._body.error, 'Invalid payment header format');
  });

  it('differentiates routes by HTTP method', async () => {
    const middleware = paymentMiddleware(routes, options);

    // POST /paid-endpoint is NOT in routes config
    const req = createReq('POST', '/paid-endpoint');
    const res = createRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true, 'POST /paid-endpoint should pass through');
  });

  it('handles POST routes that require payment', async () => {
    const middleware = paymentMiddleware(routes, options);
    const req = createReq('POST', '/submit');
    const res = createRes();

    await middleware(req, res, () => {});

    assert.equal(res.statusCode, 402);
    assert.equal(res._body.requirement.amount, '0.01');
  });

  it('works with no routes configured', async () => {
    const middleware = paymentMiddleware({}, options);
    const req = createReq('GET', '/anything');
    const res = createRes();
    let nextCalled = false;

    await middleware(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, true);
  });

  it('uses custom description in 402 response', async () => {
    const customRoutes = {
      'GET /api': { price: '0.005', description: 'Premium API access' },
    };
    const middleware = paymentMiddleware(customRoutes, options);
    const req = createReq('GET', '/api');
    const res = createRes();

    await middleware(req, res, () => {});

    assert.equal(res._body.message, 'Premium API access');
  });
});

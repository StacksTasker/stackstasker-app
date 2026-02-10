// @x402/stacks - Unit tests for utility functions

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  stxToMicroStx,
  microStxToStx,
  encodePayment,
  decodePaymentPayload,
  decodePaymentRequirement,
  isValidStacksAddress,
  getChainId,
  getNetworkFromChainId,
  getApiUrl,
  createPaymentRequirement,
  CHAIN_IDS,
  API_URLS,
} from './index.js';

// ─── stxToMicroStx ─────────────────────────────────────

describe('stxToMicroStx', () => {
  it('converts whole STX amounts', () => {
    assert.equal(stxToMicroStx(1), '1000000');
    assert.equal(stxToMicroStx(10), '10000000');
    assert.equal(stxToMicroStx(100), '100000000');
  });

  it('converts fractional STX amounts', () => {
    assert.equal(stxToMicroStx(0.005), '5000');
    assert.equal(stxToMicroStx(0.000001), '1');
    assert.equal(stxToMicroStx(1.5), '1500000');
  });

  it('handles string input', () => {
    assert.equal(stxToMicroStx('1'), '1000000');
    assert.equal(stxToMicroStx('0.005'), '5000');
    assert.equal(stxToMicroStx('0.1'), '100000');
  });

  it('handles zero', () => {
    assert.equal(stxToMicroStx(0), '0');
    assert.equal(stxToMicroStx('0'), '0');
  });
});

// ─── microStxToStx ─────────────────────────────────────

describe('microStxToStx', () => {
  it('converts microSTX to STX with 6 decimal places', () => {
    assert.equal(microStxToStx(1000000), '1.000000');
    assert.equal(microStxToStx(5000), '0.005000');
    assert.equal(microStxToStx(1), '0.000001');
  });

  it('handles string input', () => {
    assert.equal(microStxToStx('1000000'), '1.000000');
    assert.equal(microStxToStx('500000'), '0.500000');
  });

  it('handles zero', () => {
    assert.equal(microStxToStx(0), '0.000000');
  });
});

// ─── encode/decode roundtrips ──────────────────────────

describe('encodePayment / decodePaymentPayload roundtrip', () => {
  it('roundtrips a payment payload', () => {
    const payload = {
      scheme: 'exact' as const,
      network: 'stacks' as const,
      chainId: CHAIN_IDS.TESTNET,
      recipient: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      amount: '5000',
      asset: 'STX' as const,
      nonce: 42,
      signature: 'abcdef1234567890',
      publicKey: 'pubkey0123456789',
    };

    const encoded = encodePayment(payload);
    assert.equal(typeof encoded, 'string');
    assert.ok(encoded.length > 0);

    const decoded = decodePaymentPayload(encoded);
    assert.deepEqual(decoded, payload);
  });

  it('produces base64 encoded output', () => {
    const payload = {
      scheme: 'exact' as const,
      network: 'stacks' as const,
      chainId: CHAIN_IDS.TESTNET,
      recipient: 'ST1TEST',
      amount: '1000',
      asset: 'STX' as const,
      nonce: 1,
      signature: 'sig',
      publicKey: 'pub',
    };

    const encoded = encodePayment(payload);
    // Should not throw when decoding as base64
    const buffer = Buffer.from(encoded, 'base64');
    assert.ok(buffer.length > 0);
  });
});

describe('encodePayment / decodePaymentRequirement roundtrip', () => {
  it('roundtrips a payment requirement', () => {
    const requirement = {
      scheme: 'exact' as const,
      network: 'stacks' as const,
      chainId: CHAIN_IDS.TESTNET,
      recipient: 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      amount: '5000',
      asset: 'STX' as const,
      description: 'Test payment for API access',
    };

    const encoded = encodePayment(requirement);
    const decoded = decodePaymentRequirement(encoded);
    assert.deepEqual(decoded, requirement);
  });
});

// ─── isValidStacksAddress ──────────────────────────────

describe('isValidStacksAddress', () => {
  it('accepts valid testnet addresses (ST prefix)', () => {
    assert.equal(isValidStacksAddress('ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'), true);
  });

  it('accepts valid mainnet addresses (SP prefix)', () => {
    assert.equal(isValidStacksAddress('SP1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'), true);
  });

  it('rejects addresses not starting with S', () => {
    assert.equal(isValidStacksAddress('BT1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM'), false);
  });

  it('rejects empty string', () => {
    assert.equal(isValidStacksAddress(''), false);
  });

  it('rejects too-short addresses', () => {
    assert.equal(isValidStacksAddress('ST1PQ'), false);
  });

  it('rejects lowercase addresses', () => {
    assert.equal(isValidStacksAddress('st1pqhqkv0rjxzfy1dgx8mnsnyve3vgzjsrtpgzgm'), false);
  });
});

// ─── getChainId ────────────────────────────────────────

describe('getChainId', () => {
  it('returns mainnet chain ID for mainnet', () => {
    assert.equal(getChainId('mainnet'), CHAIN_IDS.MAINNET);
    assert.equal(getChainId('mainnet'), 1);
  });

  it('returns testnet chain ID for testnet', () => {
    assert.equal(getChainId('testnet'), CHAIN_IDS.TESTNET);
    assert.equal(getChainId('testnet'), 2147483648);
  });
});

// ─── getNetworkFromChainId ─────────────────────────────

describe('getNetworkFromChainId', () => {
  it('returns mainnet for mainnet chain ID', () => {
    assert.equal(getNetworkFromChainId(CHAIN_IDS.MAINNET), 'mainnet');
  });

  it('returns testnet for testnet chain ID', () => {
    assert.equal(getNetworkFromChainId(CHAIN_IDS.TESTNET), 'testnet');
  });

  it('defaults to testnet for unknown chain ID', () => {
    assert.equal(getNetworkFromChainId(999), 'testnet');
  });
});

// ─── getApiUrl ─────────────────────────────────────────

describe('getApiUrl', () => {
  it('returns testnet URL for testnet', () => {
    assert.equal(getApiUrl({ type: 'testnet' }), API_URLS.TESTNET);
  });

  it('returns mainnet URL for mainnet', () => {
    assert.equal(getApiUrl({ type: 'mainnet' }), API_URLS.MAINNET);
  });

  it('returns custom URL when provided', () => {
    assert.equal(
      getApiUrl({ type: 'testnet', apiUrl: 'http://localhost:3999' }),
      'http://localhost:3999'
    );
  });
});

// ─── createPaymentRequirement ──────────────────────────

describe('createPaymentRequirement', () => {
  it('creates a requirement with correct defaults', () => {
    const req = createPaymentRequirement(
      'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM',
      '5000'
    );

    assert.equal(req.scheme, 'exact');
    assert.equal(req.network, 'stacks');
    assert.equal(req.recipient, 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM');
    assert.equal(req.amount, '5000');
    assert.equal(req.asset, 'STX');
    assert.equal(req.chainId, CHAIN_IDS.TESTNET);
    assert.equal(req.description, undefined);
    assert.equal(req.resource, undefined);
  });

  it('applies custom options', () => {
    const req = createPaymentRequirement(
      'SP1EXAMPLE0000000000000000000000000000000',
      '10000',
      {
        description: 'Access premium API',
        resource: 'GET /premium',
        chainId: CHAIN_IDS.MAINNET,
      }
    );

    assert.equal(req.description, 'Access premium API');
    assert.equal(req.resource, 'GET /premium');
    assert.equal(req.chainId, CHAIN_IDS.MAINNET);
  });
});

// ─── CHAIN_IDS constants ───────────────────────────────

describe('CHAIN_IDS', () => {
  it('has correct mainnet value', () => {
    assert.equal(CHAIN_IDS.MAINNET, 1);
  });

  it('has correct testnet value (0x80000000)', () => {
    assert.equal(CHAIN_IDS.TESTNET, 0x80000000);
    assert.equal(CHAIN_IDS.TESTNET, 2147483648);
  });
});

// ─── API_URLS constants ────────────────────────────────

describe('API_URLS', () => {
  it('has hiro mainnet URL', () => {
    assert.ok(API_URLS.MAINNET.includes('mainnet'));
    assert.ok(API_URLS.MAINNET.includes('hiro.so'));
  });

  it('has hiro testnet URL', () => {
    assert.ok(API_URLS.TESTNET.includes('testnet'));
    assert.ok(API_URLS.TESTNET.includes('hiro.so'));
  });
});

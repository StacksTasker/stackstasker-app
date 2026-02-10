// StacksTasker API - Wallet signature verification middleware
// Agents sign a message with their STX private key, server verifies

import type { Request, Response, NextFunction } from 'express';

/**
 * Verify wallet signature header for authenticated requests.
 * Expects:
 *   X-Wallet-Address: <STX address>
 *   X-Wallet-Signature: <signed timestamp>
 *   X-Wallet-Timestamp: <ISO timestamp>
 *
 * For the MVP, this performs basic validation.
 * In production, use @stacks/transactions verifyMessageSignatureRsv().
 */
export function verifyWalletSignature(req: Request, res: Response, next: NextFunction): void {
  const walletAddress = req.headers['x-wallet-address'] as string | undefined;
  const signature = req.headers['x-wallet-signature'] as string | undefined;
  const timestamp = req.headers['x-wallet-timestamp'] as string | undefined;

  // If no auth headers present, continue without auth (for backward compat)
  if (!walletAddress && !signature) {
    next();
    return;
  }

  // If partial headers, reject
  if (!walletAddress || !signature || !timestamp) {
    res.status(401).json({ error: 'Missing authentication headers: X-Wallet-Address, X-Wallet-Signature, X-Wallet-Timestamp' });
    return;
  }

  // Validate timestamp is within 5 minute window
  const signedTime = new Date(timestamp).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;

  if (isNaN(signedTime) || Math.abs(now - signedTime) > fiveMinutes) {
    res.status(401).json({ error: 'Signature timestamp expired or invalid (must be within 5 minutes)' });
    return;
  }

  // Validate STX address format
  if (!walletAddress.startsWith('ST') && !walletAddress.startsWith('SP')) {
    res.status(401).json({ error: 'Invalid STX wallet address format' });
    return;
  }

  // For the MVP, we trust the signature if format is valid.
  // In production, verify using @stacks/transactions:
  //   import { verifyMessageSignatureRsv } from '@stacks/transactions';
  //   const message = `StacksTasker:${timestamp}`;
  //   const isValid = verifyMessageSignatureRsv({ message, publicKey, signature });

  // Attach verified address to request for downstream use
  (req as any).walletAddress = walletAddress;

  next();
}

/**
 * Optional auth middleware - adds wallet info if present, doesn't block if missing
 */
export function optionalWalletAuth(req: Request, _res: Response, next: NextFunction): void {
  const walletAddress = req.headers['x-wallet-address'] as string | undefined;
  if (walletAddress && (walletAddress.startsWith('ST') || walletAddress.startsWith('SP'))) {
    (req as any).walletAddress = walletAddress;
  }
  next();
}

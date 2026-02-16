#!/usr/bin/env node
/**
 * Deploy stackstasker-payments contract to Stacks mainnet.
 * Usage: node scripts/deploy-mainnet.mjs
 */

import { makeContractDeploy, broadcastTransaction, AnchorMode } from '@stacks/transactions';
import { readFileSync } from 'fs';

const PRIVATE_KEY = '81879ab1e8fb6c988486e2b0491f8e74b1c401e11ffdc0989fada068822e91ae01';
const CONTRACT_NAME = 'stackstasker-payments';
const NETWORK_URL = 'https://api.hiro.so';

// Read the Clarity contract source
const codeBody = readFileSync(new URL('../contracts/stackstasker-payments.clar', import.meta.url), 'utf-8');

console.log(`Deploying "${CONTRACT_NAME}" to mainnet...`);
console.log(`Contract size: ${codeBody.length} bytes`);

// Fetch the current nonce
const senderAddress = 'SPV4JB5CZWFD8BN9XMDV0F4KTS44BKRZ8TEM307V';
const nonceRes = await fetch(`${NETWORK_URL}/extended/v1/address/${senderAddress}/nonces`);
const nonceData = await nonceRes.json();
const nonce = nonceData.possible_next_nonce;
console.log(`Nonce: ${nonce}`);

const transaction = await makeContractDeploy({
  codeBody,
  contractName: CONTRACT_NAME,
  senderKey: PRIVATE_KEY,
  nonce,
  fee: 50000, // 0.05 STX fee
  network: 'mainnet',
  anchorMode: AnchorMode.Any,
});

console.log('Transaction built, broadcasting...');

const result = await broadcastTransaction({ transaction, network: 'mainnet' });
console.log('Broadcast result:', JSON.stringify(result, null, 2));

if (result.txid) {
  console.log(`\nContract deployed! TX ID: ${result.txid}`);
  console.log(`Explorer: https://explorer.hiro.so/txid/${result.txid}?chain=mainnet`);
  console.log(`\nContract address: ${senderAddress}.${CONTRACT_NAME}`);
} else {
  console.error('Deployment failed:', result);
  process.exit(1);
}

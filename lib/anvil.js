'use client';

import { createClient, createAccount } from 'genlayer-js';
import * as glChains from 'genlayer-js/chains';
import { createTransactionKit } from '@genlayer/transaction-kit';

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL || 'https://studio-next.genlayer.com/api';
export const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 61997);
export const CONTRACT_ADDRESS = (
  process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || ''
).trim();
export const EXPLORER = 'https://explorer-studio-dev.genlayer.com';
export const CHAIN_HEX = '0x' + CHAIN_ID.toString(16);

// genlayer-js ships presets under different names depending on the release,
// so pick whichever exists and pin the RPC + chain id from the environment.
const base =
  glChains.studioDevnet ||
  glChains.studionet ||
  glChains.studioNext ||
  glChains.localnet ||
  {};

export const chain = {
  ...base,
  id: CHAIN_ID,
  name: 'GenLayer Studio Next',
  nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'GenLayer Explorer', url: EXPLORER },
  },
};

/* ------------------------------------------------------------------ reads */

let readClient = null;

function getReadClient() {
  if (!readClient) {
    readClient = createClient({ chain, account: createAccount() });
  }
  return readClient;
}

export async function readBoard() {
  if (!CONTRACT_ADDRESS) throw new Error('NEXT_PUBLIC_CONTRACT_ADDRESS is not set');
  const raw = await getReadClient().readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_board',
    args: [],
  });
  const board = typeof raw === 'string' ? JSON.parse(raw) : raw;
  return {
    bounties: board?.bounties || [],
    submissions: board?.submissions || [],
    stats: board?.stats || {},
  };
}

/* ---------------------------------------------------------------- wallet */

export function hasWallet() {
  return typeof window !== 'undefined' && !!window.ethereum;
}

export async function ensureNetwork() {
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_HEX }],
    });
  } catch (err) {
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: CHAIN_HEX,
          chainName: 'GenLayer Studio Next',
          nativeCurrency: { name: 'GEN', symbol: 'GEN', decimals: 18 },
          rpcUrls: [RPC_URL],
          blockExplorerUrls: [EXPLORER],
        },
      ],
    });
  }
}

export async function connectWallet() {
  if (!hasWallet()) {
    throw new Error('No browser wallet found. Install MetaMask and reload.');
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  await ensureNetwork();
  return accounts[0];
}

/* ---------------------------------------------------------------- writes */

/**
 * Plain (non payable) writes go through Transaction Kit, which quotes the fee
 * policy, verifies it against the live chain policy and tracks the outcome.
 */
async function writeWithKit({ account, method, args, say }) {
  const kit = createTransactionKit({
    chain,
    provider: window.ethereum,
    account,
  });

  const tx = { kind: 'write', address: CONTRACT_ADDRESS, method, args };

  say('Quoting fees on Studio Next\u2026');
  const quote = await kit.estimate({ preset: 'standard' }, tx);

  if (quote?.verification?.status === 'mismatch') {
    throw new Error('The network fee policy changed mid-quote. Try again.');
  }

  say('Confirm the transaction in your wallet\u2026');
  const submitted = await kit.submit(quote, tx);
  const txId = submitted?.genlayerTxId || submitted?.txId || submitted;

  say('Submitted. Validators are running it\u2026');
  const final = await kit.track(txId, (s) => {
    const phase = [s?.phase, s?.statusName, s?.executionResultName]
      .filter(Boolean)
      .join(' \u00b7 ');
    if (phase) say(phase);
  });

  return { txId, final };
}

/**
 * Payable writes (post_bounty with a prize, fund) go through genlayer-js
 * directly. Transaction Kit sets the transaction's native value to the fee
 * deposit it calculated, which silently swallows an escrow amount; the SDK
 * keeps `value` and `fees` as separate fields, so the escrow actually arrives.
 */
async function writeWithValue({ account, method, args, value, say }) {
  const client = createClient({
    chain,
    account,
    provider: window.ethereum,
  });

  say('Estimating fees\u2026');

  let fees;
  try {
    const recommended = await client.estimateTransactionFeesForWrite({
      address: CONTRACT_ADDRESS,
      functionName: method,
      args,
      value,
    });
    fees = {
      distribution: recommended.distribution,
      feeValue: recommended.feeValue,
    };
  } catch (err) {
    const estimate = await client.estimateTransactionFees({
      leaderTimeunitsAllocation: 200n,
      validatorTimeunitsAllocation: 400n,
      executionBudgetPerRound: 1000000n,
      totalMessageFees: 0n,
      appealRounds: 1n,
      rotations: [1n, 1n],
    });
    fees = { distribution: estimate.distribution, feeValue: estimate.feeValue };
  }

  say('Confirm the transaction in your wallet\u2026');
  const txId = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: method,
    args,
    value,
    fees,
  });

  say('Submitted. Validators are running it\u2026');
  try {
    if (typeof client.waitForDecision === 'function') {
      await client.waitForDecision({ hash: txId });
    } else if (typeof client.waitForTransactionReceipt === 'function') {
      await client.waitForTransactionReceipt({ hash: txId, status: 'ACCEPTED' });
    }
  } catch (err) {
    // The transaction is already on chain; a tracking hiccup is not a failure.
    console.warn('tracking stopped early', err);
  }

  return { txId, final: null };
}

export async function sendWrite({ account, method, args, value, onStatus }) {
  if (!CONTRACT_ADDRESS) throw new Error('NEXT_PUBLIC_CONTRACT_ADDRESS is not set');
  const say = onStatus || (() => {});

  await ensureNetwork();

  const amount = value ? BigInt(value) : 0n;

  if (amount > 0n) {
    return writeWithValue({ account, method, args, value: amount, say });
  }
  return writeWithKit({ account, method, args, say });
}

/* ----------------------------------------------------------------- utils */

export function parseGen(input) {
  const text = String(input || '').trim();
  if (!text) return 0n;
  if (!/^\d*\.?\d*$/.test(text)) throw new Error('Prize must be a plain number');
  const [whole, frac = ''] = text.split('.');
  const padded = (frac + '0'.repeat(18)).slice(0, 18);
  return BigInt(whole || '0') * 10n ** 18n + BigInt(padded || '0');
}

export function formatGen(wei) {
  let value = 0n;
  try {
    value = BigInt(wei || 0);
  } catch {
    return '0';
  }
  if (value === 0n) return '0';
  const whole = value / 10n ** 18n;
  const frac = (value % 10n ** 18n).toString().padStart(18, '0').slice(0, 4).replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

export function shortAddress(address) {
  const a = String(address || '');
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

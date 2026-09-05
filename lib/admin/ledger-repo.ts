/**
 * Creator ledger persistence — server-only.
 *
 * Entries are append-only and written inside the same transaction that claims
 * a payment event, so a redelivered callback cannot credit a creator twice.
 * Balances are always derived from the entries (`deriveBalance`), never stored
 * as a mutable running total.
 */

import 'server-only';
import { FieldValue, type Transaction } from 'firebase-admin/firestore';
import { ledgerCol } from './paths';
import { deriveBalance } from '../domain/ledger-rules';
import type { CreatorBalance, LedgerEntryType } from '../domain/types';
import type { StreamerId } from '../domain/ids';

export interface AppendLedgerInput {
  type: LedgerEntryType;
  /** Signed, in sen. Positive credits the creator, negative debits them. */
  amountSen: number;
  donationId: string | null;
  providerPaymentId: string | null;
  description: string;
}

/**
 * Queues a ledger entry inside an existing transaction.
 *
 * Transactional by design: crediting a creator and marking the payment event
 * processed have to commit together, or a retry could do one without the
 * other.
 */
export function appendLedgerEntryTx(
  tx: Transaction,
  streamerId: StreamerId,
  input: AppendLedgerInput,
): string {
  const ref = ledgerCol(streamerId).doc();
  tx.set(ref, {
    ...input,
    currency: 'MYR',
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/** Appends an entry outside a transaction, for manual adjustments. */
export async function appendLedgerEntry(
  streamerId: StreamerId,
  input: AppendLedgerInput,
): Promise<string> {
  const ref = ledgerCol(streamerId).doc();
  await ref.set({
    ...input,
    currency: 'MYR',
    createdAt: FieldValue.serverTimestamp(),
  });
  return ref.id;
}

/**
 * Computes a creator's balance from their ledger.
 *
 * Reads the whole ledger, which is fine at MabarQueue's scale — a creator
 * accrues one entry per sale. If that ever stops being true the fix is a
 * periodic rollup entry, not a mutable balance field.
 */
export async function getCreatorBalance(streamerId: StreamerId): Promise<CreatorBalance> {
  const snap = await ledgerCol(streamerId).get();

  return deriveBalance(
    snap.docs.map((doc) => ({
      type: doc.data().type as LedgerEntryType,
      amountSen: Number(doc.data().amountSen ?? 0),
    })),
  );
}

export interface LedgerEntryRow {
  entryId: string;
  type: LedgerEntryType;
  amountSen: number;
  description: string;
  donationId: string | null;
  createdAtMs: number;
}

/** Recent ledger activity for the creator's dashboard. */
export async function listLedgerEntries(
  streamerId: StreamerId,
  max = 50,
): Promise<LedgerEntryRow[]> {
  const snap = await ledgerCol(streamerId).orderBy('createdAt', 'desc').limit(max).get();

  return snap.docs.map((doc) => {
    const d = doc.data();
    return {
      entryId: doc.id,
      type: d.type as LedgerEntryType,
      amountSen: Number(d.amountSen ?? 0),
      description: String(d.description ?? ''),
      donationId: (d.donationId as string | null) ?? null,
      createdAtMs: typeof d.createdAt?.toMillis === 'function' ? d.createdAt.toMillis() : 0,
    };
  });
}

/**
 * Target Firestore schema for MabarQueue as a multi-tenant SaaS.
 *
 * These interfaces describe the schema the application is migrating *toward*.
 * They are not yet wired into the running code — the live app still reads and
 * writes `users/{emailPrefix}/...` via `lib/queue.ts`, `lib/packages.ts` and
 * `lib/settings.ts`. Legacy shapes are marked where they differ, so the
 * migration can map old to new explicitly.
 *
 * Layout:
 *
 *   users/{authUid}                            → UserProfile
 *   slugs/{slug}                               → SlugMapping
 *   streamers/{streamerId}                     → Streamer
 *     /queue/{entryId}                         → QueueEntry
 *     /packages/{packageId}                    → GamePackage
 *     /donations/{donationId}                  → Donation
 *     /payment_events/{providerEventId}        → PaymentEvent
 *     /history/{id}                            → HistoryEntry
 *     /settings/{name}                         → (see lib/settings.ts)
 *   counters/{streamerId}                      → QueueCounter
 */

import type { Sen } from './money';
import type { AuthUid, PackageId, Slug, StreamerId } from './ids';
import type { GameId } from '../games';
import type { StripeAccountStatus } from './stripe-account-status';

// ─── Timestamps ───────────────────────────────────────────────────────────────

/**
 * A Firestore timestamp as seen by domain code.
 *
 * Deliberately structural rather than importing `Timestamp` from `firebase/firestore`:
 * the same types must be usable from the Admin SDK (whose `Timestamp` is a
 * different class) and from pure unit tests with no Firebase at all.
 */
export interface DomainTimestamp {
  toDate(): Date;
  toMillis(): number;
}

/** A timestamp field that may still be resolving from `serverTimestamp()`. */
export type TimestampField = DomainTimestamp | null;

// ─── Users ────────────────────────────────────────────────────────────────────

/**
 * An authenticated person, keyed by Firebase Auth UID.
 *
 * Legacy note: the current code stores this at `users/{emailPrefix}` with the
 * real UID demoted to a `uid` *field*. The migration re-keys these documents by
 * `authUid` so the tenant key becomes immutable and collision-free.
 */
export interface UserProfile {
  authUid: AuthUid;
  email: string;
  displayName: string;
  photoURL: string | null;
  /** The workspace this user lands in after login. One per user in V1. */
  primaryStreamerId: StreamerId | null;
  createdAt: TimestampField;
  updatedAt: TimestampField;
}

// ─── Slug mapping ─────────────────────────────────────────────────────────────

/**
 * Public slug → workspace mapping, keyed by the slug itself.
 *
 * Using the slug as the document ID makes uniqueness a property of Firestore
 * rather than something the application has to police, and lets a slug change
 * be a transactional create-new + delete-old.
 */
export interface SlugMapping {
  streamerId: StreamerId;
  createdAt: TimestampField;
}

// ─── Streamer workspace ───────────────────────────────────────────────────────

export type StreamerStatus = 'draft' | 'active' | 'suspended';

/**
 * A streamer workspace — the tenant boundary.
 *
 * Kept separate from `UserProfile` so ownership can move and so team members
 * can be added later without restructuring every subcollection path.
 */
export interface Streamer {
  streamerId: StreamerId;
  /** Authoritative for every authorization check. Never trusted from a client. */
  ownerUid: AuthUid;

  displayName: string;
  slug: Slug;
  avatarUrl: string | null;
  bio: string | null;

  status: StreamerStatus;
  /** Which game's queue the dashboard and overlay currently show. */
  activeGame: GameId;

  // ─ Stripe Connect. References and capability flags only — never bank
  //   details, identity documents or any other KYC data, which remain
  //   exclusively with Stripe.
  stripeAccountId: string | null;
  stripeChargesEnabled: boolean;
  stripePayoutsEnabled: boolean;
  stripeDetailsSubmitted: boolean;
  /**
   * Payment readiness derived from the flags above, stored so a read doesn't
   * have to recompute it. Always written server-side from a Stripe-sourced
   * account object — never from a client or a redirect.
   */
  stripeAccountStatus: StripeAccountStatus;
  /** First time Stripe reported charges enabled. Null until then. */
  stripeOnboardingCompletedAt: TimestampField;

  /**
   * Platform fee in basis points (500 = 5%).
   *
   * Platform-controlled: there is no streamer-facing route that writes this,
   * and Firestore rules deny all client writes to this document. Null on
   * legacy records falls back to `DEFAULT_PLATFORM_FEE_BPS`.
   */
  platformFeeBps: number | null;

  /**
   * The pre-migration `users/{emailPrefix}` document ID.
   *
   * Lets the legacy Sociabuzz webhook URL and any bookmarked `?uid=` link keep
   * resolving during the dual-read window. Removed once cutover completes.
   */
  legacyUsername: string | null;

  createdAt: TimestampField;
  updatedAt: TimestampField;
}

/** The subset of `Streamer` that is safe to expose on a public page or overlay. */
export type PublicStreamer = Pick<
  Streamer,
  'streamerId' | 'displayName' | 'slug' | 'avatarUrl' | 'bio' | 'activeGame'
> & { acceptingPayments: boolean };

// ─── Queue ────────────────────────────────────────────────────────────────────

/**
 * Queue entry status.
 *
 * A single collection with this discriminator — rather than three sibling
 * collections — is what structurally guarantees a player cannot occupy two
 * states at once: one document, one status, and every transition is a
 * single-field update inside a transaction.
 *
 *   'playing' → currently in the game (capped by the game's slot count)
 *   'waiting' → in the queue, ordered by `seq`
 *   'skipped' → "hutang game": set aside without losing credits
 */
export type QueueStatus = 'waiting' | 'playing' | 'skipped';

export interface QueueEntry {
  entryId: string;

  /** Donor/display name from the payment provider. */
  displayName: string;
  /** In-game name shown on the overlay. */
  ign: string;
  /** Game-specific numeric player ID (e.g. Mobile Legends ID). Private. */
  playerId: string | null;

  /** Lifetime credits purchased. Only ever increases. */
  totalGames: number;
  /** Credits remaining. Must never go below zero. */
  gamesLeft: number;

  status: QueueStatus;
  game: GameId;

  /**
   * Monotonic sequence number for deterministic ordering.
   *
   * The current code orders by `serverTimestamp()`, which is null for a moment
   * after a write (so a brand-new entry sorts unpredictably) and can collide
   * under simultaneous donations. An integer allocated inside the same
   * transaction as the insert removes both problems.
   */
  seq: number;

  /** Human-readable order date for the overlay, e.g. "8 MARCH". Display only. */
  orderDate: string;

  joinedAt: TimestampField;
  statusChangedAt: TimestampField;
}

/** Overlay/public projection — deliberately omits `playerId` and payment linkage. */
export type PublicQueueEntry = Pick<
  QueueEntry,
  'entryId' | 'ign' | 'totalGames' | 'gamesLeft' | 'status' | 'orderDate' | 'seq'
>;

// ─── Packages ─────────────────────────────────────────────────────────────────

/**
 * A purchasable bundle of games, configured per streamer.
 *
 * Legacy note: the current code keys packages by their *title*
 * (`users/{uid}/packages/{title}`) and stores `price` as a float in ringgit.
 * Titles contain spaces and parentheses, and a title containing "/" would
 * corrupt the document path. Here the ID is an opaque auto-ID, the title is a
 * plain field, and the price is integer sen.
 */
export interface GamePackage {
  packageId: PackageId;
  streamerId: StreamerId;

  title: string;
  description: string;

  /** Price in sen. Authoritative — read server-side, never accepted from a client. */
  priceSen: Sen;
  /** Credits granted on successful payment. Also server-side authoritative. */
  games: number;

  enabled: boolean;
  sortOrder: number;

  createdAt: TimestampField;
  updatedAt: TimestampField;
}

/** Public projection for the streamer page. */
export type PublicPackage = Pick<
  GamePackage,
  'packageId' | 'title' | 'description' | 'priceSen' | 'games'
>;

// ─── Donations / payments ─────────────────────────────────────────────────────

/** Provider-neutral, so Sociabuzz and Stripe can coexist during migration. */
export type PaymentProvider = 'stripe' | 'sociabuzz' | 'manual';

export type DonationStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'refunded'
  /** Payment succeeded but no game credits were granted (see `failureReason`). */
  | 'unfulfilled';

/**
 * A payment and the credits it produced.
 *
 * A reporting mirror of what happened, not a ledger of record: Stripe remains
 * the source of truth for money movement, balances and payout state.
 */
export interface Donation {
  donationId: string;
  streamerId: StreamerId;

  provider: PaymentProvider;
  /** Stripe PaymentIntent ID, or the Sociabuzz transaction ID. */
  providerPaymentId: string | null;

  packageId: PackageId | null;
  /** Snapshot of the title at purchase time — survives package renames. */
  packageTitle: string | null;

  // ─ Money, all integer sen
  grossSen: Sen;
  platformFeeSen: Sen;
  /** Stripe's fee. Known only after settlement; null until then. */
  processingFeeSen: Sen | null;
  /** Gross − platform fee − processing fee. Null until settled. */
  netSen: Sen | null;
  /** The rate actually applied, retained so historical records stay auditable. */
  feeBps: number;
  currency: 'MYR';

  gamesAdded: number;
  ign: string | null;
  playerId: string | null;
  donorName: string;
  /** Raw viewer message. Parsed for IGN/player ID by the legacy webhook. */
  message: string | null;

  status: DonationStatus;
  /** Why credits were not granted — e.g. 'no_player_id', 'package_disabled'. */
  failureReason: string | null;

  game: GameId;
  /** The queue entry this payment credited, when one was created or updated. */
  queueEntryId: string | null;

  createdAt: TimestampField;
  succeededAt: TimestampField;
}

// ─── Payment events (idempotency) ─────────────────────────────────────────────

/**
 * A processed provider webhook event, keyed by the **provider's** event ID.
 *
 * This document existing is the idempotency guard: credit allocation reads it
 * and writes it inside the same transaction, so a redelivered Stripe event
 * cannot grant credits twice. The current code stores `transaction_id` on the
 * queue entry but never checks it, so replays are silently additive.
 */
export interface PaymentEvent {
  /** Document ID — Stripe's `evt_...`, or the Sociabuzz transaction ID. */
  providerEventId: string;
  provider: PaymentProvider;
  /** e.g. 'checkout.session.completed'. */
  type: string;
  /** The donation this event produced, if any. */
  donationId: string | null;
  processedAt: TimestampField;
}

// ─── History ──────────────────────────────────────────────────────────────────

/** A player who used up all their credits. Existing collection, retained. */
export interface HistoryEntry {
  id: string;
  displayName: string;
  ign: string;
  playerId: string | null;
  gamesPlayed: number;
  game: GameId;
  completedAt: TimestampField;
}

// ─── Counters ─────────────────────────────────────────────────────────────────

/** Backs `QueueEntry.seq`. Incremented transactionally, one document per streamer. */
export interface QueueCounter {
  streamerId: StreamerId;
  queueSeq: number;
}

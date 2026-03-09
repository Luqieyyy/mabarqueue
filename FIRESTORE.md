# MabarQueue — Firestore Database Architecture

## Overview

MabarQueue is a multi-tenant SaaS queue management system for game streamers. Each streamer (user) has isolated data — no global collections exist. All data lives under `users/{userId}/`.

## Architecture Diagram

```
users
 └── {userId}                          ← streamer account
      ├── name: string
      ├── email: string
      ├── plan: "free" | "premium"
      ├── createdAt: timestamp
      │
      ├── queue/{docId}                ← unified queue (all player states)
      │    ├── username: string        ← Sociabuzz donor name
      │    ├── ign: string             ← Mobile Legends IGN
      │    ├── player_id?: string      ← ML numeric ID (6-10 digits)
      │    ├── totalGames: number      ← total games purchased
      │    ├── gamesLeft: number       ← remaining games
      │    ├── status: string          ← "waiting" | "playing" | "skipped"
      │    ├── orderDate: string       ← "10 MARCH"
      │    ├── timestamp: timestamp    ← when added/moved
      │    └── transaction_id?: string ← Sociabuzz txn ID
      │
      ├── donations/{docId}            ← donation log
      │    ├── donorName: string
      │    ├── amount: number
      │    ├── ign: string | null
      │    ├── player_id: string | null
      │    ├── gamesAdded: number
      │    ├── gameSource: string      ← "package" | "amount"
      │    ├── message: string
      │    ├── levelTitle: string | null
      │    ├── transaction_id: string
      │    ├── status: string          ← "success" | "failed_parse"
      │    └── timestamp: timestamp
      │
      ├── history/{docId}              ← completed game sessions
      │    ├── username: string
      │    ├── ign: string
      │    ├── player_id?: string
      │    ├── gamesPlayed: number
      │    └── completedAt: timestamp
      │
      ├── comment_album/{docId}        ← album comments (optional feature)
      │    ├── donorName: string
      │    ├── gameId: string
      │    ├── ign: string
      │    ├── amount: number
      │    ├── message: string
      │    └── timestamp: timestamp
      │
      └── settings/                    ← streamer configuration
           ├── rates
           │    └── tiers: [{amount, games}]
           ├── webhook
           │    └── token: string
           └── features
                ├── commentAlbum: boolean
                └── skipEnabled: boolean
```

## Unified Queue Design

Instead of separate collections for "in game", "waiting", and "hutang", all players live in a single `queue` collection with a `status` field:

| Status      | Meaning                                    |
|-------------|--------------------------------------------|
| `playing`   | Currently in game (max 4 slots)            |
| `waiting`   | In the waiting queue (ordered by timestamp)|
| `skipped`   | Hutang — skipped without game deduction    |

### Status Transitions

```
  ┌──────────┐       promote       ┌──────────┐
  │ waiting  │ ──────────────────→ │ playing  │
  └──────────┘                     └──────────┘
       ↑                            │       │
       │ settle                skip │       │ finish (gamesLeft > 0)
       │                            ↓       │ stays playing
  ┌──────────┐                              │
  │ skipped  │ ←────────────────────────────┘
  └──────────┘
                               finish (gamesLeft = 0)
                                    │
                                    ↓
                              ┌──────────┐
                              │ history  │ (separate collection)
                              └──────────┘
```

### Benefits over separate collections

- Single source of truth for all player data
- No data duplication when moving between states
- Status transitions are atomic (single `updateDoc`, not delete+add)
- Simpler deduplication (one query to find existing player)
- Easier analytics and reporting

## Firestore Paths

| Resource              | Path                                          |
|-----------------------|-----------------------------------------------|
| User profile          | `users/{userId}`                              |
| Queue player          | `users/{userId}/queue/{docId}`                |
| Donation record       | `users/{userId}/donations/{docId}`            |
| Game history          | `users/{userId}/history/{docId}`              |
| Album comment         | `users/{userId}/comment_album/{docId}`        |
| Rate tiers            | `users/{userId}/settings/rates`               |
| Webhook config        | `users/{userId}/settings/webhook`             |
| Feature flags         | `users/{userId}/settings/features`            |
| Webhook endpoint      | `/api/sociabuzz/{userId}`                     |

## Required Composite Indexes

The unified queue uses `where('status') + orderBy('timestamp')` which requires a composite index:

```json
{
  "collectionGroup": "queue",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "status", "order": "ASCENDING" },
    { "fieldPath": "timestamp", "order": "ASCENDING" }
  ]
}
```

## Security Rules

```
users/{userId}:
  - read/write: only if request.auth.uid == userId
  - queue, donations, history, settings: inherit parent auth

  - queue subcollection: public read allowed (for /queue and /overlay pages)
```

## Example Documents

### User Profile

```json
{
  "name": "Luqman",
  "email": "luqman@gmail.com",
  "plan": "free",
  "createdAt": "2026-03-10T12:00:00Z"
}
```

### Queue Player (status: playing)

```json
{
  "username": "TestDonor",
  "ign": "Luqieyyy",
  "player_id": "43149159",
  "totalGames": 3,
  "gamesLeft": 2,
  "status": "playing",
  "orderDate": "10 MARCH",
  "timestamp": "2026-03-10T12:05:00Z",
  "transaction_id": "5844610989"
}
```

### Donation

```json
{
  "donorName": "Someone",
  "amount": 1,
  "ign": "Luqieyyy",
  "player_id": "43149159",
  "gamesAdded": 1,
  "gameSource": "package",
  "message": "43149159 Luqieyyy",
  "levelTitle": "PACKAGE MABAR 1 GAME",
  "transaction_id": "5844610989",
  "status": "success",
  "timestamp": "2026-03-10T12:05:00Z"
}
```

### History

```json
{
  "username": "TestDonor",
  "ign": "Luqieyyy",
  "player_id": "43149159",
  "gamesPlayed": 3,
  "completedAt": "2026-03-10T14:30:00Z"
}
```

### Settings — Rates

```json
{
  "tiers": [
    { "amount": 4, "games": 1 },
    { "amount": 10, "games": 3 },
    { "amount": 20, "games": 6 },
    { "amount": 30, "games": 10 }
  ]
}
```

## Scaling Considerations

- **Documents stay small**: Each queue/donation doc is under 1KB
- **Collections can grow**: Firestore handles millions of docs per collection
- **User isolation**: No cross-tenant queries needed
- **Indexes**: Single composite index covers all queue queries
- **Real-time**: Filtered listeners (`where status == X`) are efficient
- **Cleanup**: History collection can be archived/deleted periodically

## Best Practices

1. Never create root-level collections — everything under `users/{uid}/`
2. Use `serverTimestamp()` for all time fields
3. Queue status transitions should be atomic single-doc updates
4. Always return HTTP 200 to Sociabuzz webhook (prevent retries)
5. Deduplicate players by `username` field before inserting
6. Composite index on (status, timestamp) is required for queue queries

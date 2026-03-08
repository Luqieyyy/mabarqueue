# SynoQueue

**Automated live mabar queue management system for streamers.**
Viewers donate via Sociabuzz → auto-join the game queue → streamer presses Finish Game → deducts games automatically.

---

## What Changed (Latest Update)

### Core Logic Overhaul
- **Multi-player current game**: Up to **4 viewers** can be IN GAME at the same time (Syno + 4 viewers = 5 players per game).
- **Finish Game deducts from ALL**: When Syno presses "Finish Game", all 4 in-game viewers lose 1 game each.
- **Skip → Hutang Game**: If a viewer has internet issues, Syno can Skip them. They move to **Hutang Game** with their games **unchanged** (no deduction). Selagi tak tekan Finish Game, baki game takkan dikurang.
- **Auto-promote**: When a slot opens, the next person in queue is automatically pulled into the game.
- **Hutang Game panel**: Separate list for skipped viewers. Syno can send them back to queue when they're ready, or remove them.

### New Data Model (Firestore Collections)
| Collection | Purpose |
|---|---|
| `current_game` | Players currently in the mabar (max 4 docs) |
| `queue` | Waiting players ordered by timestamp |
| `hutang_game` | Skipped players (internet issues, etc.) — games NOT deducted |
| `donations` | Sociabuzz donation log |
| `settings/webhook` | Webhook token storage |

### New Fields Per Player
| Field | Description |
|---|---|
| `username` | Sociabuzz donor name |
| `ign` | In-Game Name (shown in overlay) |
| `totalGames` | Total games purchased (accumulates) |
| `gamesLeft` | Remaining games to play |
| `orderDate` | Order date, e.g. `"8 MARCH"` |
| `timestamp` | Firestore server timestamp |

### New UI Theme
- Changed from dark to **bright/light theme** (white cards, slate background)
- Dashboard columns match the spreadsheet: **Nickname · Jumlah Game · Waktu Order · Baki Game**
- OBS overlay redesigned as a **table format** matching the live stream spreadsheet display

---

## Pages

| Route | Description |
|---|---|
| `/` | Landing page |
| `/login` | Streamer login |
| `/dashboard` | Streamer dashboard — full queue management |
| `/overlay` | OBS browser source — spreadsheet-style table overlay |
| `/queue` | Public queue — viewers see their position |

---

## Dashboard Guide

### IN GAME Panel (left)
- Shows up to 4 viewer slots currently in the mabar
- **Finish Game** button: −1 from ALL viewers simultaneously. Viewers at 0 leave; queue fills the slots.
- **Skip** button (per viewer): moves that viewer to Hutang Game — **no deduction**
- **×** (Remove): permanently removes that viewer from the session
- **+/−**: manually adjust a viewer's remaining games

### Waiting Queue (right, table)
Columns matching the spreadsheet overlay:
- `#` — Position number
- `Nickname` — In-Game Name (and Sociabuzz username if different)
- `Jumlah Game` — Total games purchased
- `Waktu Order` — Date they ordered (e.g., "8 MARCH")
- `Baki Game` — Games remaining (colour-coded: red ≤1, amber ≤3, blue ≥4)

Per-row actions: **+/−** games, **Hutang** (move to hutang list), **×** remove

### Hutang Game Panel
- Players who were skipped (no deduction)
- **Queue** button: sends them back to waiting queue
- **×** button: permanently remove

### Donation Feed
- Last 20 Sociabuzz donations
- Shows donor name, RM amount, IGN, and games added

### OBS Overlay Preview
- Mini preview of what the overlay looks like
- **Copy OBS Link** button — copy the URL for OBS browser source

---

## OBS Overlay Table

The `/overlay` page renders a **white spreadsheet-style table** that matches the stream layout:

```
┌─────────────────────────────────────────────────────────────────┐
│                         WAITING LIST                            │
├──────────┬──────────────┬────────────┬────────────┬────────────┤
│          │   Nickname   │Jumlah Game │Waktu Order │ Baki Game  │
├──────────┼──────────────┼────────────┼────────────┼────────────┤
│ IN GAME  │  ulquiorra   │     6      │            │     5      │  ← green rows
│          │  zynn        │    12      │  8 MARCH   │    11      │
│          │  ashiapp     │    10      │            │     6      │
├──────────┼──────────────┼────────────┼────────────┼────────────┤
│ NEXT TURN│  last choice │     3      │            │     3      │  ← orange rows
├──────────┼──────────────┼────────────┼────────────┼────────────┤
│  QUE     │  itachi      │     5      │  9 MARCH   │     4      │  ← purple rows
└──────────┴──────────────┴────────────┴────────────┴────────────┘
```

**OBS Browser Source settings:**
- URL: `https://your-domain.vercel.app/overlay`
- Width: `500`
- Height: `600`
- Allow transparency: ✓
- Refresh browser when scene becomes active: ✓

---

## Donation Tiers

| Amount | Games |
|--------|-------|
| RM4 | 1 game |
| RM10 | 3 games |
| RM20 | 6 games |
| RM30 | 10 games |

Viewers must include IGN in donation message: `IGN: YourIGN`

---

## Sociabuzz Webhook Flow

```
Viewer donates on Sociabuzz
        ↓
Sociabuzz sends POST to /api/sociabuzz
        ↓
Server extracts: donorName, amount, IGN from message
        ↓
Converts RM amount → games (tier table above)
        ↓
addPlayerToQueue(donorName, IGN, games, orderDate)
        ↓
If current_game has open slot → join IN GAME directly
If game is full → join waiting queue
If already exists → totalGames + gamesLeft bumped
```

### Test Webhook Manually
```bash
curl -X POST http://localhost:3000/api/sociabuzz \
  -H "Content-Type: application/json" \
  -d '{"donor_name":"TestUser","amount":10,"message":"IGN: TestIGN"}'
```

---

## Firestore Security Rules (Production)

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public read for queue display
    match /current_game/{doc} { allow read: if true; allow write: if false; }
    match /queue/{doc} { allow read: if true; allow write: if false; }

    // Private — server only
    match /hutang_game/{doc} { allow read, write: if request.auth != null; }
    match /donations/{doc} { allow read: if request.auth != null; allow write: if false; }
    match /settings/{doc} { allow read, write: if request.auth != null; }
  }
}
```

---

## Setup

### 1. Firebase
1. Create project at [Firebase Console](https://console.firebase.google.com)
2. Enable **Firestore Database** (test mode for dev)
3. Enable **Authentication > Email/Password**
4. Register web app → copy config values

### 2. Environment Variables
```bash
cp .env.local.example .env.local
```
Fill in `.env.local`:
```
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
```

### 3. Create Streamer Account
In Firebase Console → Authentication → Users → Add user (email + password for Syno to log in)

### 4. Run Locally
```bash
npm install
npm run dev
```

### 5. Deploy to Vercel
```bash
npx vercel
```
Add the same env variables in Vercel dashboard → Project → Settings → Environment Variables.

### 6. Configure Sociabuzz Webhook
1. Sociabuzz → Integrations → Webhook
2. Webhook URL: `https://your-vercel-domain.vercel.app/api/sociabuzz`
3. Enable webhook → copy token
4. In SynoQueue dashboard → click "Webhook" → paste token → Save

---

## Project Structure

```
app/
  page.tsx                  # Landing page
  dashboard/page.tsx        # Streamer dashboard (main control panel)
  overlay/page.tsx          # OBS table overlay (no auth required)
  overlay/layout.tsx        # Transparent layout for OBS
  login/page.tsx            # Login page
  queue/page.tsx            # Public queue viewer
  api/
    sociabuzz/route.ts      # Sociabuzz webhook handler
    queue/route.ts          # Queue state JSON endpoint
  globals.css               # Light theme animations + scrollbar
  layout.tsx                # Root layout

lib/
  firebase.ts               # Firebase init
  queue.ts                  # All queue logic (addPlayer, finishGame, skip, hutang, etc.)
  donation.ts               # convertDonationToGames, extractIGN
  auth.ts                   # useAuth hook

components/
  CurrentPlayerPanel.tsx    # IN GAME panel — 4 viewer slots + Finish Game button
  QueueList.tsx             # Table with Nickname/Jumlah/Waktu/Baki columns
  HutangGamePanel.tsx       # Hutang Game list with settle/remove actions
  AddPlayerForm.tsx         # Manual add player form
  DonationFeed.tsx          # Recent donations feed
  OverlayPreview.tsx        # Mini OBS overlay preview + copy link
  Navbar.tsx                # Top navigation bar
  WebhookSettings.tsx       # Webhook config drawer
```

---

## Key Logic Rules

| Action | Effect |
|---|---|
| Donation received | Player added to IN GAME (if slot open) or Queue |
| **Finish Game** pressed | ALL in-game viewers −1 game; zeros removed; queue fills slots |
| **Skip** (in-game) | Viewer → Hutang Game; **no deduction**; queue fills slot |
| **Hutang → Queue** | Viewer back in waiting queue at end |
| Player reaches 0 games | Auto-removed from IN GAME; next in queue fills slot |
| Same donor donates again | `gamesLeft` and `totalGames` both incremented (not duplicated) |

---

*Built for Syno · synoplays_*

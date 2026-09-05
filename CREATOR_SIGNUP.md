# Creator signup

## Flow

`/register` → Firebase email verification → `/onboarding` → `/dashboard`.
Google sign-in uses the existing Firebase provider; verified accounts proceed directly to identity setup. Existing workspace owners go to their dashboard. Admin claims retain the admin login destination. Password reset uses Firebase's hosted reset email flow from `/login`.

Signup collects email, password and confirmation, then creator name and handle. Phone, business metadata, social links and preferences are deferred; no invented company or policy acceptance records are written. Payment onboarding remains at `/dashboard/payments` and does not block queue setup. The public URL remains `/streamer/{slug}`.

## Storage and authorization

Firebase owns email uniqueness, password storage/hashing and provider password-policy enforcement. The client checks an eight-character minimum, confirmation and Firebase's configured policy. Configure the Firebase Auth password policy with an eight-character minimum (or stronger) to enforce that same minimum against direct Auth API calls.

`POST /api/streamers` verifies the Firebase bearer token (including revocation) and requires a verified email. It trims and bounds creator names to 1–60 characters and reuses the existing normalized slug rules, length limits and reserved-name list. Taken handles and repeated creator creation return 409; invalid inputs return 400; missing/invalid authentication returns 401; unverified email returns 403.

The existing Firestore transaction now writes the user profile, streamer workspace, unique slug mapping and starter packages together. The `streamer` role, ownership and default fee are server-controlled. It checks both the user workspace pointer and existing ownership, so older records without a pointer cannot create another workspace. Failed commits leave no partial Firestore setup; the Firebase account remains available for retry through login/onboarding.

No new collections, destructive migration, or backfill is required. New dashboard data uses `users/{authUid}`. An existing `users/{emailPrefix}` document is reused only if its stored UID matches the authenticated owner; its existing settings/packages remain untouched. The workspace's `legacyUsername` field records the dashboard path, including the UID for new users. The dashboard obtains that path from the authenticated workspace endpoint before attaching listeners.

The existing system still has two data layouts: the legacy queue dashboard under `users`, and public Stripe workspace data under `streamers`. This feature retains both and seeds their existing package formats. Unifying those pre-existing queue/payment paths is outside signup scope.

Firestore rules now prohibit browser profile creation/deletion and changes to UID, authUid, email, role, workspace pointer and dashboard path. Existing dashboard subcollection permissions remain unchanged. Deploy these rules with the application; they are part of the security boundary. Existing admin assignments should be managed with the server seed script or Admin SDK.

## UX and recovery

- Email verification uses Firebase's hosted action handler and a same-origin return URL.
- The verification page reports send failures, supports resend with a 60-second UI cooldown, and reloads the Auth user and token before continuing.
- Cross-device verification can resume by signing in on the original device.
- Creator drafts are stored in session storage keyed by UID; passwords are never persisted by the application.
- Handle conflicts remain editable. A repeated submission whose first response was lost checks for the owned workspace before redirecting.
- Name and handle labels, inline errors, status messages, password visibility, loading states and duplicate-submit guards are included.
- No Cloudflare challenge is imitated: the project has no Turnstile integration.

## Deployment and verification

Use the existing `.env.local.example` Firebase client and Admin credentials. In Firebase Authentication, enable Email/Password and Google, authorize deployed/preview domains used for email action return links, configure the password policy, and customize the Firebase verification/reset templates for MabarQueue. Do not use the reference brand's assets or emails.

Deploy `firestore.rules` along with the app (`firebase deploy --only firestore:rules` in the configured Firebase project). No production resources or Auth configuration are changed by this local implementation.

Automated coverage in `lib/admin/creator-signup.test.ts` calls the real route, authentication wrapper and repository with mocked Firebase boundaries: token failures, email verification, invalid fields, forged ownership/fees, duplicate workspaces, taken handles, legacy ownership/collisions, atomic commit failure and retry. This is not a real Firestore concurrency or rules-emulator test.

Manual acceptance: register a fresh email; open its verification link; complete identity; retry an occupied handle; reload between steps; check Google login, password reset, mobile layout and existing legacy accounts. Confirm the dashboard opens and starter packages exist. Live email/OAuth and browser acceptance still require an available browser and a Firebase test account.

Local validation completed: `npm run typecheck`, `npm run lint`, `npm test` (138 tests, including 14 signup tests), `npm run build`, and `git diff --check`. The built app returned HTTP 200 for the five account/dashboard pages and HTTP 401 for unauthenticated creator creation. Browser discovery returned no available browsers; live OAuth/email delivery and Firestore rules-emulator/concurrency checks were not run.

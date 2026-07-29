# Development Participant Payment Connection — API Plan

- Work unit / Workboard card: `fd9371d0-841c-4a34-aa27-9a41b5ad4ffb`
- Owner: Backend/API Integrator
- Consumer: participant application, payment, mypage, and refund-status UX
- Baseline: `fix/mobile-jest-pool-ko-resolver` at `5f78281a927b7aafbb88d7d788d2ae357454a19f`
- Entry instruction: Room 986, 2026-07-28 23:14 KST

## Bounded contract and service slice

Use the existing `packages/contracts` application, payment order, payment
record, and refund schemas without adding a provider or money-movement
contract. Permit an issued in-memory participant dev session to authenticate
only the allowlisted participant profile, application, and mypage endpoints.
Every `/api/payments/*` endpoint remains outside this bridge and outside this
work unit. The session stays server-issued, short-lived, and in memory; no
token is committed, logged, or exposed through public config.

The mobile client will consume the existing endpoints:

- `GET/PATCH /api/participant/profile`
- `POST /api/tournament-applications`
- `GET /api/tournament-applications/:applicationId`
- `GET /api/participant/mypage`

Request/response schemas remain:

- `createTournamentApplicationRequestSchema` / `tournamentApplicationSchema`
- `myPageResponseSchema`

Auth failure remains fail-closed. Participant application and mypage routes
accept either the existing server preview bearer or a valid participant dev
session through an explicit allowlist limited to participant profile,
tournament application, and mypage paths. The route layer binds application
creation/read to the dev session's `participantId`: it ignores a request-supplied
participant identity for a dev session and rejects reads not owned by that
participant. Existing preview-bearer behavior remains unchanged. No retry is
automatic beyond an explicit user refresh. Existing contract-owned
participant HTTP errors remain the error mapping.

Participant dev sessions gain an internal capability marker. Kakao-issued
mobile sessions default to participant MVP access with payment-provider access
disabled. Existing isolated payment route tests may explicitly issue a
payment-capable test session. `/api/payments/*` rejects the Kakao-issued session
before initializing payment/refund services, mechanically preventing the
in-memory mobile bearer from reaching provider-backed order/refund behavior.

The payment connection for this work unit is the existing
`operatorManagedOffline` `paymentRecordSchema` record returned by mypage after
application creation. This deliberately does not call `POST /api/payments/orders`
or initialize `payment.service.ts`, because that service may use an HTTP
sandbox provider outside tests. The existing sandbox order routes remain
unchanged and out of this work unit. A focused mobile/API test must assert that
this flow calls only the allowlisted participant/profile/application/mypage
paths and never `/api/payments/*`; that negative assertion is required
evidence, not merely a non-goal.

After Kakao continuation succeeds, Mobile App Dev will pass the returned
dev-session access token directly into `createParticipantApiClient` together
with `EXPO_PUBLIC_API_URL`. The token lives only in the module's in-memory API
client instance for the current process. It is excluded from
`persistedKakaoDevSession`, public environment/config, UI copy, logs, and
durable evidence. Reloading the process requires login again before API-backed
participant mutations can resume.

## Tests, compatibility, and operations

- First backend test: prove one issued participant dev session can update DUPR,
  create/read its application, and read mypage while an invalid token remains
  rejected.
- Auth boundary test: prove the same Kakao-style participant session receives
  `PAYMENT_FORBIDDEN` from `/api/payments/*` before a payment service call.
- Mypage contract assertions prove the associated operator-managed payment
  record/status is returned after application creation.
- No schema, migration, dependency, provider configuration, or deployment
  change.
- Rollback: remove the participant-dev-session alternative from general
  participant route auth.
- Runtime smoke: focused API route tests, then API lint/test if feasible.
- Evidence: `.evidence/wm/fd9371d0-841c-4a34-aa27-9a41b5ad4ffb/`.
- Plan/final reviewers: `wm-contract-reviewer` and
  `wm-implementation-reviewer`.

## Non-goals and human gates

No sandbox-provider HTTP call, live PG, live provider call, provider console, real money, production
release, Railway mutation, deployment, push, PR, merge, secret read, or
production credential handling. Because this is constrained to the existing
local sandbox/mock behavior and performs no money movement, the
`payment-money-movement` human gate is not activated. Deployment remains a
separate closed supervisor/Room 986 gate.

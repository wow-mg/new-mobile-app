# Payment/Refund Participant Session Auth Plan

Date: 2026-07-28
Workboard card: `4e69095d-b338-42fc-b7a3-29c138fde848`
Work-unit: `3bcaec22-d5d9-4d33-aa78-7c449aae7605`
Stage: `03-contract-api`
Owner: Backend/API Integrator

## Scope and verified Source of Truth

This is a sandbox/dev-only mobile-facing backend auth correction for the 3E
payment/refund flow. The consuming Mobile App Dev flow needs to create and read
payment orders, reconcile payment state, request refunds, and read refund
history without compiling a bearer credential into the app.

Material decisions use these verified repo-local sources:

- `AGENTS.md`: TDD, shared-contract ownership, no public secrets, no provider
  calls, and route -> service -> db import direction.
- `PROJECT_ENVIRONMENT.md`: `EXPO_PUBLIC_*` is public client configuration and
  must never contain bearer credentials; payment runtime is sandbox/dev only.
- `.agents/skills/wm/SKILL.md`: plan/review/checkpoint/final-review and durable
  evidence requirements.
- `.agents/skills/mobile-backend-api-integrator-workflow/SKILL.md` and
  `references/sot.md`: Backend/API Integrator owns auth/session behavior and
  the `03-contract-api` handoff.
- `mobile-app-dev-team/runtime-sources/role-souls/backend-api-integrator-soul.md`:
  bounded backend ownership, contract-first behavior, and secret safety.
- `apps/api/src/routes/kakao-auth.ts`: the existing authenticated Kakao flow
  already issues an opaque random `dev-session` access token with a 10-minute
  server-side expiry and keeps the provider token server-side.
- `packages/contracts/src/index.ts`: `kakaoDevAuthSuccessSchema` is the current
  contract for that session token.
- `apps/api/src/routes/payments.ts`: payment/refund routes currently require
  `PARTICIPANT_PREVIEW_BEARER_TOKEN` and use the sandbox participant identity.
- `apps/mobile/src/participant/api-client.ts`: the current public-env bearer
  lookup is unsafe and is the blocker documented in
  `.evidence/wm/3bcaec22-d5d9-4d33-aa78-7c449aae7605/blocker-audit-3.md`.

## Contract plan packet

- Endpoints affected:
  - Existing auth issuance: Kakao callback/continue/additional-info responses
    continue returning `KakaoDevAuthSuccess.session.accessToken`.
  - Existing payment/refund methods and paths remain unchanged:
    `POST /api/payments/orders`, `GET /api/payments/:paymentRecordId`,
    `POST /api/payments/:paymentRecordId/reconcile`,
    `POST /api/payments/:paymentRecordId/refunds`, and
    `GET /api/payments/:paymentRecordId/refunds`.
- Request/response schemas: existing payment/refund schemas remain unchanged.
  No provider secret or new provider-facing field is added.
- Auth/session behavior: payment/refund endpoints accept only a live,
  server-issued Kakao dev-session bearer token. The server resolves the
  participant identity from its session registry. Missing, unknown, expired,
  operator, general API, and retired preview credentials fail closed with the
  existing contract-owned `PAYMENT_FORBIDDEN` response.
- Session lifetime: existing 10-minute server-side TTL. Logout/unlink revokes
  the same token. Provider access tokens remain server-private.
- Participant mapping: current sandbox/dev participant data is bound
  server-side to the authenticated session; no participant identifier is
  accepted from the client.
- Retry behavior: auth failures are non-retryable until re-authentication.
  Existing payment mutation idempotency and order-attempt key reuse are
  unchanged.
- Error mapping: preserve the existing payment API error envelope and status
  to avoid downstream schema drift.
- Contract symbols: reuse `kakaoDevAuthSuccessSchema` /
  `KakaoDevAuthSuccess`; no new shared request/response shape is expected
  unless tests reveal a necessary contract change.
- Mobile compatibility: Mobile App Dev passes the in-memory authenticated
  session access token to the participant/payment client. Remove the
  `EXPO_PUBLIC_PARTICIPANT_API_BEARER_TOKEN` lookup; token persistence policy
  and UI wiring remain Mobile App Dev ownership.
- Fixtures/mocks: add or update API route/auth test helpers that issue a real
  dev session without live Kakao/provider calls. No production or provider
  fixture is introduced.

## Tests-first execution and checkpoints

1. Checkpoint A — session contract and route auth:
   - First add failing API tests proving an issued dev session is accepted,
     expired/unknown/server/operator/preview tokens are rejected, and the
     session resolves participant identity server-side.
   - Exercise all five affected payment/refund paths through `app.request` so
     `apps/api/src/app.ts` cannot preempt the session with the general bearer
     gate: create, read, reconcile, refund request, and refund history.
   - Implement the smallest reusable server-side participant-session boundary
     and switch payment/refund middleware to it.
   - Run focused API route tests.
   - Review input: this plan, checkpoint diff, focused command output, this
     artifact/evidence path, and remaining mobile-config cleanup.
   - Reviewer: `wm-contract-reviewer`.
2. Checkpoint B — mobile unsafe config removal and full verification:
   - First update the participant API client test to reject dependence on an
     `EXPO_PUBLIC_*` bearer credential.
   - Remove only the unsafe public bearer lookup while preserving injectable
     runtime session-token configuration for the authenticated app flow.
   - Run contracts/API/mobile focused tests, then applicable workspace lint and
     tests.
   - Review input: approved plan, cumulative diff, command output, evidence,
     and remaining gate impact.
   - Reviewer: `wm-implementation-reviewer`.

## Migration, rollback, smoke, and gate impact

- Database migration: not applicable; session storage remains ephemeral and
  server-side for sandbox/dev.
- Deployment/config: no deploy and no new secret or environment variable.
- Runtime smoke: local in-process route tests only; no live provider,
  payment, refund, Railway, or production call.
- Rollback: revert the bounded session-service/payment middleware/mobile config
  changes. Existing payment/refund schemas and persistence are unaffected.
- Required verification: focused contract/API/mobile tests, API/mobile lint and
  test as applicable, `pnpm turbo run lint test`, and `pnpm run test:runtime`
  if durable work-unit validation is affected.
- Evidence: reviewer reports and command results under
  `.evidence/wm/3bcaec22-d5d9-4d33-aa78-7c449aae7605/`.
- Required reviewers: `wm-contract-reviewer` and
  `wm-implementation-reviewer` for the plan and final actual work. Both must
  return `GO` before completion.
- Completion check: scoped `git diff`, then full `git status --short`.

## Non-goals and risks

- No production auth design, durable session database, refresh token, secure
  device persistence, provider API change, live payment/refund call, deploy,
  push, merge, or PR.
- No React Native UI implementation.
- No acceptance of payment/legal/compliance or production credential risk.
- Residual risk: the existing dev session is process-local and expires on
  restart. That is acceptable only for the explicitly bounded sandbox/dev
  scope and must not be represented as production readiness.
- The worktree already contains extensive unrelated/uncommitted work. This run
  will preserve it and report only the bounded paths it changes.

## Planning reviewer routing record

- Agent: `wm-contract-reviewer`
  - Question: Is the proposed reuse of the existing short-lived Kakao dev
    session a secret-safe, fail-closed payment/refund contract with adequate
    tests and no shared-schema drift?
  - Conclusion: pending.
  - Source refs/evidence: this plan and plan-review report path.
  - Reflection/impact: implementation cannot start without `GO`.
- Agent: `wm-implementation-reviewer`
  - Question: Is the plan tests-first, scope-contained, compatible with the
    dirty worktree, and sufficient to remove the public bearer dependency?
  - Conclusion: pending.
  - Source refs/evidence: this plan and plan-review report path.
  - Reflection/impact: implementation cannot start without `GO`.

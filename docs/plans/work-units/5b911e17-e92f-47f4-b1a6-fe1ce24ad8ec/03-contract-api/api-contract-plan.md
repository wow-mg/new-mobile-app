# Refund/Cancel/Admin API Contract Plan

Work unit: `5b911e17-e92f-47f4-b1a6-fe1ce24ad8ec`

Stage: `03-contract-api`

Owner: Backend/API Integrator

## Verified sources of truth

- `AGENTS.md`: tests-first, `packages/contracts` contract ownership, route →
  service → db direction, non-interactive Drizzle migration, branch/PR gates.
- `PROJECT_ENVIRONMENT.md`: Hono/Drizzle/Postgres API baseline, sandbox-only
  payment environment, required workspace verification and secret boundaries.
- `docs/plans/work-units/5b911e17-e92f-47f4-b1a6-fe1ce24ad8ec/codex-role-routing.md`:
  approved service-open refund/cancel/admin backend scope, required reviewers,
  and explicit human gate for real refunds/provider proof.
- `.agents/skills/wm/SKILL.md`: tests-first checkpoints, durable evidence,
  mandatory plan/final read-only reviews, and final diff/status inspection.
- `.agents/skills/mobile-backend-api-integrator-workflow/SKILL.md` and
  `references/sot.md`: API Contract Plan Packet requirements and role boundary.
- `mobile-app-dev-team/runtime-sources/role-souls/backend-api-integrator-soul.md`:
  bounded backend ownership, payment escalation, contract/mock/evidence duties.
- Existing baseline in `packages/contracts/src/index.ts`,
  `apps/api/src/{db,routes,services}`: participant payment and operator auth
  boundaries that this additive slice extends.

## Scope and contract boundary

Consuming flow: a service-open participant requests cancellation/refund, reads
the synchronized status and immutable history, while an authenticated operator
approves, rejects, or explicitly asks the sandbox mock provider to process an
approved refund.

Contract SoT remains `packages/contracts/src/index.ts`; a matching deterministic
sandbox fixture is exported from `packages/contracts/src/fixtures/refund.ts`.
API implementation consumes those schemas and does not declare parallel
request/response types.

### Participant endpoints

| Method/path | Request | Response | Auth |
| --- | --- | --- | --- |
| `POST /api/payments/:paymentRecordId/refunds` | `createRefundRequestSchema` (`reason` only) | `refundRequestSchema` | participant preview bearer; owner-only |
| `GET /api/payments/:paymentRecordId/refunds` | none | `refundHistoryResponseSchema` | participant preview bearer; owner-only |

### Operator endpoints

| Method/path | Request | Response | Auth |
| --- | --- | --- | --- |
| `POST /api/admin/refunds/:refundRequestId/approve` | `approveRefundRequestSchema` (optional all-or-nothing operator override object) | `adminRefundRequestResponseSchema` | operator bearer |
| `POST /api/admin/refunds/:refundRequestId/reject` | `rejectRefundRequestSchema` (`reason`) | `adminRefundRequestResponseSchema` | operator bearer |
| `POST /api/admin/refunds/:refundRequestId/request-provider-refund` | `requestProviderRefundSchema` (idempotency key) | `adminRefundRequestResponseSchema` | operator bearer; sandbox mock only |

### Shared schema fields

- `refundPolicyDecisionSchema`:
  `fullRefund | partialRefund | noRefund | operatorOverride`.
- `refundRequestStatusSchema`:
  `operatorReview | approved | rejected | providerPending | refunded |
  providerFailed`.
- `refundRequestSchema` (strict): refund request/payment/application IDs,
  status, policy decision, paid/requested/approved amounts in integer KRW,
  currency `KRW`, customer reason, requested/updated instants, and a
  customer-safe history array. It excludes actor identity, operator-only notes,
  provider raw metadata, and internal idempotency keys.
- `refundHistoryEntrySchema` (strict): history ID, event
  (`requested | approved | rejected | providerRequested | providerSucceeded |
  providerFailed`), customer-safe actor kind
  (`customer | operator | sandboxProvider`), resulting refund/application/
  payment statuses, amount/currency when applicable, customer-safe message,
  and timestamp.
- `refundTransactionSchema` (strict admin/internal response use): transaction
  ID, refund request ID, `sandboxMock` provider kind, status
  (`mockPending | mockSucceeded | mockFailed`), amount/currency, safe provider
  reference, and timestamps. Raw provider payloads are never public.
- `adminRefundRequestResponseSchema` (strict): `{ refundRequest,
  latestTransaction }`, composing `refundRequestSchema` and an optional
  `refundTransactionSchema`. All three operator actions return this same shape;
  approve/reject omit `latestTransaction`, while mock-provider request includes
  it. The nested refund request carries the customer-safe immutable history.
- `refundHistoryResponseSchema` (strict): one `refundRequest` including its
  immutable customer-safe history.
- `approveRefundRequestSchema` is strict and either `{}` or
  `{ override: { decision: "operatorOverride", amountKrw, reason } }`.
  `amountKrw` is a nonnegative integer, `reason` is required/nonblank, and the
  service rejects amounts above the captured paid amount. An override may
  approve a full, partial, or zero amount including a server-evaluated
  `noRefund`, but remains state-only and never authorizes live money movement.
- `rejectRefundRequestSchema` is strict with a required bounded reason.
- `requestProviderRefundSchema` is strict with a bounded idempotency key.

Participant error codes use `paymentApiErrorResponseSchema`:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `PAYMENT_RECORD_NOT_FOUND` | 404 | payment/refund record absent |
| `PAYMENT_APPLICATION_OWNERSHIP_MISMATCH` | 403 | participant does not own it |
| `REFUND_POLICY_UNAVAILABLE` | 409 | authoritative server policy missing/invalid; fail closed |
| `REFUND_INVALID_TRANSITION` | 409 | current refund/payment/application state conflicts |
| `REFUND_REQUEST_NOT_FOUND` | 404 | history/request absent |
| `PAYMENT_FORBIDDEN` | 403 | participant auth failure |

Operator error codes use `adminApiErrorResponseSchema`:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `ADMIN_API_NOT_FOUND` | 404 | refund request absent |
| `ADMIN_REFUND_INVALID_TRANSITION` | 409 | stale/invalid decision state |
| `ADMIN_REFUND_OVERRIDE_INVALID` | 400 | override missing reason/out of bounds |
| `ADMIN_REFUND_PROVIDER_UNAVAILABLE` | 503 | sandbox mock failure |
| `ADMIN_API_FORBIDDEN` / `ADMIN_API_DEV_STAGING_ONLY` | 403 | operator auth/runtime restriction |

Mutating participant/operator decisions are not automatically retried. Only the
mock-provider request is replay-safe with the same idempotency key; a changed
payload/key after transition is rejected.

## Domain behavior

- `evaluateRefundPolicy` is a pure evaluator over server-supplied instants and
  amounts. The service loads paid amount/currency from the owned payment,
  service start from the tournament, and cutoff hours/partial percentage from
  server-owned policy columns. The participant supplies none of these. Before
  the full cutoff is full refund, before the partial cutoff is partial refund,
  and after the partial cutoff is no refund. Missing, invalid, or reversed
  authoritative policy fails closed. The complete evaluated policy snapshot is
  persisted with the request.
- Operator override is accepted only while `operatorReview`, requires the
  explicit override object/reason, and is bounded to `0..paidAmountKrw`. It can
  override any server policy result including `noRefund`, but only changes the
  approved state/amount in this mock workflow.
- Status flow:
  `requested/operatorReview → approved | rejected`;
  `approved → providerPending → refunded | providerFailed`.
- Application/payment synchronization:
  request → `cancellationRequested` / `refundRequested`;
  reject → `submitted` / prior paid state;
  approve → `cancellationApproved` / `refundApproved`;
  mock provider success → `cancelled` / `refunded`.
- Each database-backed transition runs in one `db.transaction`: guarded
  current-state read/update, synchronized refund/application/payment update,
  immutable history insert, transaction insert/update when applicable, and
  durable audit insert. Zero changed guarded rows is a conflict. The in-memory
  test adapter applies the same transition rules synchronously.
- Provider idempotency is unique per refund request and key; an identical replay
  returns the existing result without another mock call. Other stale/concurrent
  decisions fail with the relevant invalid-transition error.
- `refund_history` is the durable domain/audit record exposed in customer-safe
  form. Existing structured operational logging additionally emits redacted
  admin action events; it does not replace durable history.
- Provider behavior is a deterministic injected mock. No HTTP refund method,
  live provider credential, or production money movement is introduced.

## Persistence and migration

- Add nullable authoritative refund-policy columns to `tournaments`
  (`full_refund_cutoff_hours`, `partial_refund_cutoff_hours`,
  `partial_refund_percent`); missing values fail closed.
- Add `refund_requests`: restrictive references to
  `payment_records.payment_record_id`,
  `tournament_applications.application_id`, and
  `participant_profiles.participant_id`; one active request per payment via
  unique `payment_record_id`; policy snapshot, decision amounts, state,
  timestamps, and no cascade deletion.
- Add `refund_transactions`: restrictive reference to
  `refund_requests.refund_request_id`; many historical attempts per request;
  unique composite `(refund_request_id, idempotency_key)`; safe mock provider
  reference/status/amount/timestamps.
- Add `refund_history`: restrictive reference to
  `refund_requests.refund_request_id`; many immutable ordered events per request;
  resulting synchronized statuses, redacted actor kind/message, and timestamp.
- Extend application/payment status storage through existing text columns; no
  destructive type migration is required.
- Generate the next Drizzle schema-diff migration non-interactively with
  `pnpm --filter @template/api exec drizzle-kit generate`.
- Verify the existing programmatic migration path with a bounded migration unit
  test/mock of `runMigrations()` and API build; do not connect to or mutate a
  production database. A real database migration smoke is recorded as
  not-run/QA handoff when no approved disposable DB is available.
- Rollback assessment: additive tables can be dropped in reverse dependency
  order before deployment; application code must be rolled back before the
  migration. Production rollback/application is outside this repo-local run.

## Tests, evidence, and checkpoints

Evidence root:
`.evidence/wm/5b911e17-e92f-47f4-b1a6-fe1ce24ad8ec/`.

Before source/test edits, capture full `git status --short`, branch, overall
diff stat, and scoped diffs for overlapping intended paths under the evidence
root. Intended targets are the contract source/tests/fixture exports; API
schema/migration/meta; refund service/provider/routes/tests; minimal existing
payment/admin/app integration; and this work-unit/evidence only. Every checkpoint
compares against that captured baseline; unrelated dirty changes are neither
reset nor reformatted.

1. **Plan gate (read-only):** `wm-contract-reviewer` and
   `wm-implementation-reviewer` review this packet against the routing artifact
   and SoTs. Both must return `GO` before implementation.
2. **Contracts/tests-first checkpoint:** add failing contract tests plus service
   policy/transition tests and route tests before source implementation. Capture
   their expected failure output, checkpoint diff, remaining-plan impact, and
   bounded `wm-contract-reviewer` plus `wm-implementation-reviewer` verdicts
   before moving on.
3. **Implementation checkpoint:** implement the smallest contracts/fixture,
   schema/migration, mock provider, service, route integration, and focused
   audit/status sync required to pass. Run contract and API tests/lint/build,
   confirm route → service → db import direction, then
   `pnpm turbo run lint test` and `pnpm run test:runtime`. Capture command output
   and diff. `pnpm run test:local-harness` is not applicable because no Codex
   runtime-controlled path is changed.
4. **Final gate (read-only):** both required reviewers assess the actual diff,
   commands, migration, evidence, contract drift, mock-only boundary, and human
   gate. Any Critical/High/Medium finding or failed/missing required check blocks
   completion.

Runtime smoke: focused contract/API tests plus API build. No deployed provider
smoke is claimed. Workspace gate: `pnpm turbo run lint test`.

## Non-goals, gates, and handoff

- No React Native UI, unrelated refactor, production deployment, external repo
  change, live provider call, credential addition, or real refund.
- Real refund execution and provider settlement/proof require explicit recorded
  human approval and QA/Release evidence; mocks cannot satisfy that gate.
- No tenant/PII expansion. Actor and participant references in customer/audit
  surfaces remain minimized/redacted.
- Mobile App Dev consumes the shared schemas/fixture; QA/Release receives the
  migration, rollback, focused test, workspace gate, and mock-boundary evidence.
- Completion requires material `git diff` inspection and full
  `git status --short`; the dirty baseline is preserved and disclosed.

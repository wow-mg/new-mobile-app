# 3B Sandbox Payment Backend — API Contract Plan Packet

## Routing and source of truth

- Work unit: `40754bdd-be47-4977-a8af-9fb2e60bebb2`
- Task label: `picklehub-3b-inisis-backend`
- Routing input: Workboard inline `codex-role-workflow/v1` comment dated
  2026-07-27 10:27 KST, supplied in the execution request.
- Source request: Workboard card `40754bdd-be47-4977-a8af-9fb2e60bebb2`
  and `room-986` decisions supplied in the execution request.
- Owner: Backend/API Integrator.
- Allowed skill: `mobile-backend-api-integrator-workflow`, invoked through
  `$wm`.
- Durable stage: `03-contract-api`.
- Repo SoT read: `AGENTS.md`, `PROJECT_ENVIRONMENT.md`,
  `.agents/skills/wm/SKILL.md`,
  `.agents/skills/mobile-backend-api-integrator-workflow/SKILL.md`,
  `.agents/skills/mobile-backend-api-integrator-workflow/references/sot.md`,
  `mobile-app-dev-team/runtime-sources/skills/codex-role-workflow/SKILL.md`,
  `mobile-app-dev-team/runtime-sources/role-souls/backend-api-integrator-soul.md`,
  and `mobile-app-dev-team/governance/gates-and-evidence.md`.
- Bounded lookup used focused `rg` and file reads because no Serena tool is
  available in this session.

## Scope and consuming flow

The consuming flow is the authenticated participant tournament-application
payment flow in sandbox/dev-staging. This work owns shared payment schemas plus
the bounded API route/service/provider-client/database implementation.

Affected implementation paths:

- `packages/contracts/src/index.ts`
- `packages/contracts/__tests__/payment-contract.test.mjs`
- `packages/contracts/src/fixtures/payment.ts`
- `apps/api/src/routes/payments.ts`
- `apps/api/src/routes/__tests__/payments.test.ts`
- `apps/api/src/services/payment.service.ts`
- `apps/api/src/services/__tests__/payment.service.test.ts`
- `apps/api/src/services/payment-provider.client.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/src/env.ts`
- `apps/api/src/app.ts`
- `PROJECT_ENVIRONMENT.md` (payment env names/purpose only; never values)
- generated `apps/api/drizzle/0004_*.sql` and matching Drizzle metadata

Existing dirty Kakao, operations, mobile, environment, contract, schema, and
Drizzle changes are preserved. Payment changes will be bounded to new files and
payment-specific hunks in overlapping files.

## Contract

Shared Zod schemas and inferred TypeScript types will be defined only in
`packages/contracts`:

- `paymentModeSchema`: preserves `operatorManagedOffline` and adds
  `card` and `simplePay`.
- `paymentStatusSchema`: preserves `notStartedSandbox`, `operatorReview`, and
  `confirmedOffline`; adds `orderCreated`, `pendingProvider`, `paid`,
  `failed`, `cancelled`, and `refunded`.
- `paymentProviderStatusSchema`: `created`, `pending`, `paid`, `failed`,
  `cancelled`, or `refunded`.
- `createPaymentOrderRequestSchema`: `applicationId`, `paymentMode`,
  VAT-inclusive `amount`, `currency: "KRW"`, and bounded idempotency key.
- `paymentOrderResponseSchema`: public-safe payment record/order projection.
- `reconcilePaymentRequestSchema`: identifies the application/order and expected
  VAT-inclusive amount/currency; it does not accept a caller-selected terminal
  state.
- `paymentApiErrorResponseSchema` and error literals for application not found,
  ownership mismatch, amount mismatch, idempotency conflict, invalid transition,
  provider unavailable, and sandbox-only configuration.

Endpoint plan:

| Method | Path | Request | Response |
| --- | --- | --- | --- |
| `POST` | `/api/payments/orders` | `createPaymentOrderRequestSchema` | `paymentOrderResponseSchema` (`201`, or `200` for an idempotent replay) |
| `GET` | `/api/payments/:paymentRecordId` | path parameter | `paymentOrderResponseSchema` |
| `POST` | `/api/payments/:paymentRecordId/reconcile` | `reconcilePaymentRequestSchema` | `paymentOrderResponseSchema` |

The route adds participant-only authentication instead of inheriting the broad
server/operator token allowlist as sufficient payment authorization. In
dev-preview/tests, only the participant preview token resolves to the fixed
sandbox participant context. Operator/server tokens do not authorize these
participant payment endpoints. Participant identity never comes from request
JSON. Services also fail closed when the application is absent or does not
belong to the resolved participant.

Application status transitions are explicit:

- create: no provider payment record -> `orderCreated`;
- provider create accepted: `orderCreated` -> `pendingProvider`;
- reconcile: `orderCreated` or `pendingProvider` -> `pendingProvider`, `paid`,
  `failed`, or `cancelled`;
- later reconcile: `paid` -> `refunded` only when the provider reports that
  already-completed state; this endpoint does not initiate a refund;
- identical-state reconciliation is idempotent;
- offline states and all other backward/terminal transitions are rejected.

No retry cadence is added. Provider dependency errors are explicit and
non-secret. Mobile loading/retry policy remains a downstream concern. No cash
receipt field or behavior is introduced.

## Persistence and provider boundary

`payment_records` gains provider payment/order/status fields, generic
VAT-inclusive amount and currency, unique idempotency key, JSON audit/raw
metadata fields, and created/provider/reconciled timestamps. Existing
`amount_krw`, offline fields, and record timestamps remain readable for backward
compatibility. Database names remain snake_case and API names camelCase.

The provider client is an injected interface. Its default runtime construction
requires sandbox/dev-staging mode plus private env configuration. Provider
credentials are never returned, logged, committed, or read by tests. Unit tests
use placeholder-free in-memory mocks and sanitized provider metadata only.

The private environment names are `PAYMENT_PROVIDER_ENV`,
`PAYMENT_PROVIDER_BASE_URL`, `PAYMENT_PROVIDER_MERCHANT_ID`, and
`PAYMENT_PROVIDER_SECRET`. Only `sandbox` and `dev-staging` provider
environments are accepted. Names and behavior are documented in
`PROJECT_ENVIRONMENT.md`; values remain environment-injected and are never
recorded. Deployment remains a QA/Release handoff and is not performed here.

Reusable contract-safe examples live in
`packages/contracts/src/fixtures/payment.ts` and cover create, pending, paid,
failed, and error responses without provider secrets or sensitive raw payloads.
They are exported by `packages/contracts` for Mobile App Dev and QA. Existing
offline `paymentRecordSchema` fields stay compatible, so current mobile mocks do
not require UI changes; downstream consumers may adopt the new fixtures in a
separate Mobile App Dev work unit.

Migration procedure: update Drizzle schema, then use non-interactive
`drizzle-kit generate`. Rollback assessment: the migration is additive; rollback
is a reviewed migration that removes the new unique index/columns only after
confirming no sandbox records require them. No migration is applied to a live
database in this work.

## Tests-first checkpoints

1. Contract and behavior tests first:
   - contract literals and request/response/error parsing;
   - route create/read/reconcile shapes;
   - service idempotent replay and conflicting replay;
   - VAT-inclusive application amount check;
   - application ownership and not-found checks;
   - allowed and rejected status transitions;
   - provider failure mapping and absence of secret/raw sensitive output.
   Checkpoint evidence includes the failing targeted test output and test-only
   diff. Contract and implementation reviewers must return GO before the next
   checkpoint.
2. Minimal implementation:
   - shared contract schemas/types;
   - additive DB schema/migration;
   - injected provider client;
   - service and routes registered under `/api/payments`;
   - private environment parsing with sandbox/dev-staging guard.
   Checkpoint evidence includes targeted passing tests, migration diff, scoped
   implementation diff, and remaining verification impact. Both reviewers must
   return GO before final verification.
3. Final verification and review:
   - contracts tests/build/lint;
   - API tests/build/lint;
   - `pnpm turbo run lint test` if feasible;
   - `git diff` for payment paths and full `git status --short`.
   Final actual-work evidence is reviewed by `wm-contract-reviewer` and
   `wm-implementation-reviewer`.

Evidence root:
`.evidence/wm/40754bdd-be47-4977-a8af-9fb2e60bebb2/`.

Runtime smoke is limited to mocked API route tests and local API build/tests.
No deployment, live provider call, charge, cancellation/refund, or production
readiness proof is in scope.

## Review routing record

- Agent: `wm-contract-reviewer`
  - Question: Is the proposed shared contract, ownership, idempotency, amount,
    transition, and error boundary safe and complete for sandbox/dev-staging?
  - Evidence: this packet plus the cited repo SoT and existing payment paths.
  - Impact: any Critical/High/Medium finding or non-GO verdict blocks editing.
- Agent: `wm-implementation-reviewer`
  - Question: Is the scope minimal, tests-first, migration-safe, compatible with
    the dirty worktree, and sufficient for repo gate readiness?
  - Evidence: this packet plus the cited repo SoT and current status.
  - Impact: any Critical/High/Medium finding or non-GO verdict blocks editing.

Dedicated `wm-contract-reviewer` and `wm-implementation-reviewer` are sufficient.
Product/Planning and Design reviewers are not applicable because the supplied
routing artifact already resolves a bounded backend contract work unit and no
layout, interaction, or visual hierarchy changes are made.

## Non-goals, gates, and unresolved proof

- No mobile/Kakao/operations implementation.
- No retry schedule or cadence.
- No cash receipt.
- No participant self-cancellation or refund policy change; existing PRD
  behavior remains authoritative.
- No production provider mode, key, live charge/refund, deployment, push, merge,
  or external platform claim.
- Human gate: sandbox/test-mode only. Production credentials and live payment
  proof remain blocked external evidence.
- Blocking prerequisite:
  `docs/plans/work-units/40754bdd-be47-4977-a8af-9fb2e60bebb2/00-product-planning/human-gates/payment-money-movement.json`
  must contain an approved `human-gate/v1` decision from the authorized human
  owner. The execution request's scope limit is coordination context, not a
  substitute for that durable decision envelope.
- Required reviewers: `wm-contract-reviewer`,
  `wm-implementation-reviewer`.
- Completion requires final reviewer evidence, scoped `git diff`, and full
  `git status --short`.

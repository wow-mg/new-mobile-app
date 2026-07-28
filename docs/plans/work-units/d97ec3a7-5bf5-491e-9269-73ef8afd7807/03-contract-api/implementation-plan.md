# 3C Provider Webhook And Status Reconciliation Plan

## Routing and source of truth

- Workboard card/work unit: `d97ec3a7-5bf5-491e-9269-73ef8afd7807`
- Owner: Backend/API Integrator
- Entry case: `contract_or_backend`
- Invoked workflow: `$wm` with
  `mobile-backend-api-integrator-workflow`
- Durable stage: `03-contract-api`
- Consuming flow: PickleHub MVP participant payment and operator-managed
  refund status synchronization in sandbox/dev only
- Verified SoT:
  - `AGENTS.md`
  - `PROJECT_ENVIRONMENT.md`
  - `REPO_OPERATIONS.md`
  - `.agents/skills/wm/SKILL.md`
  - `.agents/skills/mobile-backend-api-integrator-workflow/SKILL.md`
  - `.agents/skills/mobile-backend-api-integrator-workflow/references/sot.md`
  - `mobile-app-dev-team/runtime-sources/role-souls/backend-api-integrator-soul.md`
  - `.evidence/room986-payment-provider-20260727-1026/3A-payment-provider-human-gated-contract.md`
  - merged-in-place 3B payment contract/service/schema/tests and
    `docs/plans/work-units/40754bdd-be47-4977-a8af-9fb2e60bebb2/03-contract-api/implementation-plan.md`
- Navigation: focused `rg` and bounded file reads; Serena is not exposed in
  this session.

## Scope and contract boundary

Implement backend-owned
`POST /api/payments/providers/kg-inicis/webhook` for fixture/mock sandbox
events. A new `paymentProviderWebhookRoute` is mounted directly by
`apps/api/src/app.ts`, separate from `paymentsRoute` and its participant
bearer-token `.use('*')` middleware. The webhook accepts a signature only
through `x-payment-provider-signature`, never requires participant bearer auth,
never returns or logs secret material, and delegates verification and
reconciliation to the payment service. Route tests prove missing/invalid
signatures fail closed and a valid fixture signature succeeds without a bearer
token.

Shared contract additions in `packages/contracts`:

| Export | Purpose |
| --- | --- |
| `paymentProviderWebhookEventSchema` / `PaymentProviderWebhookEvent` | Fixture-safe body with optional provider event id, provider order/payment refs, application ref, amount, `KRW`, provider status, and occurred-at timestamp |
| `paymentWebhookProcessingResultSchema` | `processed`, `duplicate`, or `ignoredOutOfOrder` |
| `paymentProviderWebhookResponseSchema` / `PaymentProviderWebhookResponse` | `{ accepted: true, result, paymentRecordId, status }` without secret/raw-provider fields |
| `paymentProviderWebhookErrorCodeSchema` / `PaymentProviderWebhookErrorCode` | `PAYMENT_WEBHOOK_SIGNATURE_REQUIRED`, `PAYMENT_WEBHOOK_SIGNATURE_INVALID`, `PAYMENT_WEBHOOK_EVENT_INVALID`, `PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND`, `PAYMENT_WEBHOOK_REFERENCE_MISMATCH`, `PAYMENT_WEBHOOK_AMOUNT_MISMATCH`, `PAYMENT_WEBHOOK_PERSISTENCE_FAILED` |
| `paymentProviderWebhookErrorResponseSchema` | `{ error }` |

Contract fixtures live in
`packages/contracts/src/fixtures/payment-provider-webhook.ts`. They contain
body-only events and the literal non-secret signature placeholder
`fixture-valid-signature`; the signature header is transport authentication,
not a request-body contract field.

HTTP/error/retry mapping:

| Outcome | HTTP | Contract result | Retry |
| --- | --- | --- | --- |
| missing/invalid signature | `401` | signature error | no automatic backend retry |
| malformed event | `400` | event-invalid error | caller must correct |
| payment/reference/amount/application mismatch | `409` | matching error | manual investigation; no mutation |
| non-KRW or malformed currency | `400` | event-invalid error | caller must correct |
| new allowed event | `200` | `processed` | idempotent replay safe |
| duplicate id/hash | `200` | `duplicate` | safe acknowledgement |
| valid out-of-order event | `200` | `ignoredOutOfOrder` | audit retained, no mutation |
| persistence failure | `503` | persistence error | provider may retry same event |

The webhook request identifies provider event/order/payment references,
application, amount, currency, provider status, and occurrence time. The
backend matches all of these against the stored payment record and the
backend-owned application price before state mutation. Client/provider amount
is evidence to compare, never the pricing authority.

Authentication is provider-signature authentication, separate from participant
bearer auth. `PaymentWebhookVerifier` is an injected boundary whose input is
the raw body bytes plus signature header; the verified parser output is used
only after verification succeeds. Runtime construction remains
sandbox/dev-staging only and uses the existing private provider secret without
reading, printing, persisting, or returning it. Tests use a deterministic
placeholder verifier and fixture payloads; no live Inisis call or exact
production signing algorithm is claimed. Invalid-signature requests generate
only a generic security rejection metric/result; unverified request fields are
not persisted as provider audit facts.

## Persistence, state, and handoff

Add a durable `payment_provider_events` event/audit table with:

- internal audit id;
- provider and provider event id when supplied;
- deterministic event hash fallback;
- payment record/application references;
- event/status, verification and processing result;
- sanitized payload metadata only;
- received/occurred/processed timestamps;
- provider-scoped unique `(provider, provider_event_id)` when an id exists;
- versioned deterministic hash fallback with unique
  `(provider, event_hash_version, event_hash)`.

The deterministic hash is SHA-256 over canonical JSON with sorted, explicitly
selected fields: provider, provider order/payment refs, application ref,
provider status, amount, currency, and occurred-at timestamp. The current
version is `v1`; transport headers and unknown/raw fields are excluded.

`PaymentWebhookStore.processVerifiedEvent` is the atomic persistence boundary.
The Postgres implementation uses one database transaction to:

1. claim the provider-scoped event id/hash through the unique indexes;
2. lock/read the target payment record;
3. re-check references and backend-owned application pricing;
4. apply an allowed transition or retain state for an out-of-order event;
5. finalize the durable audit outcome; and
6. insert a durable notification-handoff/outbox record keyed by provider-event
   audit id only when state changed.

A unique-conflict maps to the already-committed audit outcome and returns
`duplicate`; it never mutates state or emits another handoff. Tests include two
concurrent identical deliveries and assert one transition/audit winner and one
notification handoff. The injected notification trigger runs only after commit
and receives the durable audit id as its idempotency key. Trigger failure does
not roll back payment reconciliation; the durable handoff remains pending for
an out-of-scope dispatcher/retry owner. This card does not implement delivery.

The payment record transition policy remains explicit:

- `orderCreated` -> `pendingProvider | paid | failed | cancelled`
- `pendingProvider` -> `pendingProvider | paid | failed | cancelled`
- `paid` -> `paid | refunded`
- terminal same-state repeats are idempotent
- backward/out-of-order or other terminal changes are recorded as ignored
  without changing payment/application state
- mismatched application/order/payment/amount/currency is rejected and
  audit-recorded without mutation.

Successful new state changes invoke the post-commit notification-trigger
handoff with sanitized identifiers, status, and the durable idempotency key
only. Duplicate and ignored out-of-order events do not trigger it.

Migration is additive and generated through non-interactive
`drizzle-kit generate`; no database is contacted or migrated. Rollback is a
reviewed follow-up migration removing only the new audit table/indexes after
confirming sandbox audit retention requirements.

## Tests-first checkpoints

Affected paths are bounded to:

- `packages/contracts/src/index.ts`
- `packages/contracts/src/fixtures/payment-provider-webhook.ts`
- `packages/contracts/__tests__/payment-provider-webhook-contract.test.mjs`
- `apps/api/src/routes/payment-provider-webhook.ts`
- `apps/api/src/routes/__tests__/payment-provider-webhook.test.ts`
- `apps/api/src/services/payment-webhook.service.ts`
- `apps/api/src/services/__tests__/payment-webhook.service.test.ts`
- `apps/api/src/db/schema.ts`
- `apps/api/src/app.ts`
- one generated additive Drizzle migration and metadata
- this work-unit plan and `.evidence/wm/...` evidence only.

1. Contract/service/route tests and placeholder webhook fixtures first:
   duplicate provider event id, deterministic-hash duplicate, out-of-order
   event, concurrent duplicate, failed event, invalid signature, no bearer
   requirement, reference/amount/currency/application mismatch, durable audit
   outcome, secret-safe response, and exactly one post-commit notification
   handoff.
   Capture the expected RED result and test-only diff under
   `.evidence/wm/d97ec3a7-5bf5-491e-9269-73ef8afd7807/`.
2. Checkpoint review: both `wm-contract-reviewer` and
   `wm-implementation-reviewer` review the approved plan, RED output, test diff,
   evidence path, and remaining impact. Any non-GO material finding blocks
   implementation.
3. Minimal contract, schema/migration, verifier, service, and route
   implementation. Run targeted contract/API tests and capture output.
4. Checkpoint review: both reviewers assess the implementation diff, targeted
   command output, evidence, and remaining full-gate impact. Any non-GO
   material finding is fixed before final verification.
5. Final verification commands:
   - `pnpm --filter @template/contracts test`
   - `pnpm --filter @template/contracts build`
   - `pnpm --filter @template/api test`
   - `pnpm --filter @template/api build`
   - `pnpm --filter @template/api lint`
   - `pnpm turbo run lint test`
   - `pnpm run validate:work-units`
   - `pnpm run validate:evidence-hygiene`
   - scoped `git diff` and full `git status --short`.
   Both reviewers must return final `GO` before 3C is reported complete.

## Evidence and gates

- Evidence root:
  `.evidence/wm/d97ec3a7-5bf5-491e-9269-73ef8afd7807/`
- Plan review, RED test, checkpoint review, command output, and final actual-work
  review are durable.
- Required reviewers: `wm-contract-reviewer` and
  `wm-implementation-reviewer`.
- Runtime smoke is mocked route/service execution only.
- Required shared contract paths remain under `packages/contracts`.
- Gate impact: workspace code tests/lint plus work-unit/evidence hygiene;
  no mobile visual QA applies because no mobile/UI code is in scope.

## Non-goals and hard boundaries

- No production keys/mode, live provider calls, payment/refund calls, webhook
  registration, deployment, push, merge, PR, or external-provider proof.
- No 3D refund/cancel implementation, 3E mobile UX, or 3F release/evidence
  readiness claim.
- No automatic retry policy.
- No external notification delivery.
- No plaintext secret access, output, log, fixture, or commit.
- Exact KG Inicis production signing format remains a human/provider-doc gate;
  this implementation supplies a replaceable verifier boundary and mock
  fixtures only.

## Planning review record

- `wm-contract-reviewer`: review signature/auth boundary, contract SoT,
  idempotency identity, reference and pricing checks, state transitions,
  fixture compatibility, and audit schema.
- `wm-implementation-reviewer`: review tests-first ordering, dirty-tree
  containment, additive migration, route/service/db direction, evidence, and
  gate completeness.
- Dedicated `wm-*` agents are sufficient. Product/Planning and Design review
  are not applicable to this already-routed backend-only 3C card.

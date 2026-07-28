# Refund/Cancel/Admin Service Evidence

## Delivered boundary

- Participant request/history:
  `POST|GET /api/payments/:paymentRecordId/refunds`.
- Operator approve/reject/mock-provider request:
  `POST /api/admin/refunds/:refundRequestId/{approve,reject,request-provider-refund}`.
- Shared strict schemas and sandbox fixture remain in `packages/contracts`.
- Policy inputs and paid amount are loaded server-side. Customer input is
  limited to a bounded reason.
- The provider client is deterministic `sandboxMock` code with no HTTP method,
  base URL, credential, secret, or live-refund capability.

## Persistence and migration

- Generated migration: `apps/api/drizzle/0005_goofy_mercury.sql`.
- Generated snapshot: `apps/api/drizzle/meta/0005_snapshot.json`.
- Additive policy columns on `tournaments`.
- `refund_requests` has restrictive FKs to payment, application, and participant
  records plus one-request-per-payment uniqueness.
- `refund_transactions` has a restrictive request FK and per-request
  idempotency uniqueness.
- `refund_history` has a restrictive request FK and immutable domain/audit
  events.
- Service DB transitions use `db.transaction`, guarded refund/current-state
  updates, synchronized application/payment updates, history writes, and
  transaction writes.
- Programmatic migration boundary is covered with injected test dependencies and
  verified client cleanup. No real database migration was run because this
  session had no approved disposable target; production apply/proof is a
  QA/Release handoff.

Rollback: roll back application code first, then drop refund history,
transactions, requests, and nullable policy columns in reverse dependency order.
Production rollback remains an operator procedure and was not executed.

## Verification

- `pnpm --filter @template/contracts build` — pass.
- `pnpm --filter @template/contracts test` — 16/16 pass.
- Focused refund API suites — 19/19 pass.
- `pnpm --filter @template/api test` — 76/76 pass.
- `pnpm --filter @template/api build` — pass.
- `pnpm --filter @template/api lint` — pass.
- `pnpm turbo run lint test` — 7/7 tasks pass; API 76/76, contracts
  16/16, mobile tests/lint pass.
- `pnpm run test:runtime` — pass, including 47 hook fixture tests.
- `git diff --check` — pass.
- Import-direction inspection — routes import services; refund service imports
  db; db files do not import routes/services.

`pnpm run test:local-harness` is not applicable: no Codex runtime-controlled
path was changed.

## Human gate and external proof

Real refunds, provider settlement, live provider proof, production migration,
and deployment were not attempted. They require explicit recorded human
approval and QA/Release evidence. Repo-local mocks and tests do not satisfy that
gate.

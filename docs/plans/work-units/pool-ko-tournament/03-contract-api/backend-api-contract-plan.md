# Backend/API Contract Plan

- Work unit: `pool-ko-tournament`
- Workboard card: `e8f59168-0d89-46fb-9012-d9a38d102b27`
- Owner: Backend/API Integrator
- Artifact stage: `03-contract-api`
- Consumers: Admin tournament operations and Participant App read-only tournament views
- Source: `../00-product-planning/pool-ko-design-packet.md`
- Status: implementation authorized by `READY_FOR_EXECUTION`

## Contract boundary

This slice is a shared DTO and DB-free pure-engine package. It adds no HTTP
endpoint or persistence behavior. A future API may transport the DTOs, but this
packet does not select method/path semantics before service scope is approved.

The shared contract exports POOL+KO division configuration/status, entrants and
merge lineage, pools, matches/stages/slots, score-derived standings, audit
events, permissions, and a stable downstream fixture. There is deliberately no
request schema or function for direct standings mutation.

## Shared schemas and types

- `poolKoDivisionSchema` / `PoolKoDivision`
- `poolKoEntrantSchema` / `PoolKoEntrant`
- `poolSchema` / `Pool`
- `poolKoMatchSchema` / `PoolKoMatch`
- `poolStandingSchema` / `PoolStanding`
- `koBracketSchema` / `KoBracket`
- `poolKoAuditEventSchema` / `PoolKoAuditEvent`
- `poolKoPermissionsSchema` / `PoolKoPermissions`
- `poolKoSnapshotSchema` / `PoolKoSnapshot`

The fixture is exported from `@template/contracts/fixtures/pool-ko` for Admin
and Participant App contract development.

## Engine plan

The package will export deterministic, database-free `assignPools`,
`generateRoundRobin`, `rankPool`, `mapQualifiersToKo`, `generateKoBracket`, and
`applyWithdrawal` functions. IDs, ordering inputs, and public-draw resolutions
are explicit. No function uses randomness. Invalid entrant counts and
incomplete tie resolution return typed validation errors.

## Integration behavior

- Auth/session: no endpoint or session behavior changes in this slice.
- Loading/retry: consumer-owned until an HTTP service is scoped; pure calls do
  not retry.
- Errors: pure functions return stable `PoolKoEngineError` values rather than
  throwing for domain-invalid states.
- Compatibility: additive package exports only; existing auth/payment exports
  remain untouched.
- Migration/rollback: no database migration. Rollback is removal of the
  additive POOL+KO exports and fixture before consumers adopt them.
- Runtime smoke: contract package build, lint, and Node tests.

## Review, non-goals, and gates

- Plan/final reviewers: Mobile Architect via `wm-contract-reviewer`, with
  `wm-implementation-reviewer` for final implementation evidence.
- Non-goals: API routes, database access, UI, deployment, provider consoles,
  money movement, production release, and secret-bearing configuration.
- Human gates remain closed as recorded in `../status.json`.
- Completion requires recorded test output, `git diff`, and
  `git status --short`.

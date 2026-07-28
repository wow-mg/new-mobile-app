# Backend/API Evidence

- Work unit: `pool-ko-tournament`
- Workboard card: `e8f59168-0d89-46fb-9012-d9a38d102b27`
- Owner: Backend/API Integrator
- Evidence level: contract and unit test
- Service state: contract/fixture ready; no API service or deployment claimed

## Changed files

- `packages/contracts/src/pool-ko.ts` — shared POOL+KO DTO schemas/types and
  deterministic, database-free engine functions.
- `packages/contracts/src/fixtures/pool-ko.ts` — stable downstream snapshot.
- `packages/contracts/src/index.ts` — root contract exports.
- `packages/contracts/package.json` — stable fixture subpath export.
- `packages/contracts/__tests__/pool-ko-contract.test.mjs` — DTO, permission,
  audit, fixture, and no-direct-standings-mutation contract coverage.
- `packages/contracts/__tests__/pool-ko-engine.test.mjs` — N=3..64 sizing,
  scheduling, ranking/public draw, qualifier/bracket, invalid seed, and
  withdrawal/default coverage.
- `packages/contracts/__tests__/package-exports.test.mjs` — fixture export
  contract.
- `docs/plans/work-units/pool-ko-tournament/03-contract-api/backend-api-contract-plan.md`
  — pre-edit contract plan.
- This evidence note.

## Validation

Passed:

- `node_modules/.bin/tsc --noEmit --project packages/contracts/tsconfig.json`
- `node_modules/.bin/tsc --project packages/contracts/tsconfig.json`
- `node --test packages/contracts/__tests__/*.test.mjs` — 9 test files passed,
  0 failed.
- `git diff --check`

Unavailable or pre-existing blocker:

- `pnpm --filter @template/contracts ...` and Turbo package scripts could not
  start because pnpm attempted to create `/root/.local/share/pnpm/store`
  outside the writable workspace. No dependency or global tooling change was
  attempted.
- `node scripts/validate-work-units.mjs` reports that the supplied, pre-existing
  `pool-ko-tournament/status.json` is not `wu-status/v1` and lacks canonical
  `stage`, `state`, and `owner_role` fields. This slice does not rewrite the
  Product/Planning source-of-truth envelope.
- Local staging/commit is blocked because this managed workspace mounts `.git`
  read-only; `git add` failed while creating `.git/index.lock`. Owner: workspace
  operator or a Git-enabled session.

## Review evidence

Initial read-only `wm-contract-reviewer` and `wm-implementation-reviewer`
reviews found six issues:

- avoidable same-pool first-round matches;
- KO withdrawal not represented as a bye;
- tied recorded games falling through to an away win;
- unvalidated duplicate/gapped qualifier seeds;
- public draws used without runtime audit validation;
- withdrawal changes crossing the requested stage boundary.

Each finding was fixed with regression coverage. Final re-review is recorded in
the implementation handoff/report.

## Stable DTO handoff

Admin and Participant App consumers may import the additive root contracts from
`@template/contracts` and the stable snapshot from
`@template/contracts/fixtures/pool-ko`.

The handoff includes:

- effective `kPerPool` value plus default/override source;
- division status, scoring, withdrawal, draw, lock, and publish state;
- entrant/team identity, seed, club metadata, and merge lineage;
- pool assignment/order/match references and manual-adjustment audit;
- pool/KO matches, explicit slots/sources/byes, scores, and default metadata;
- score-derived standings with tie/head-to-head/public-draw metadata;
- audit events and role-specific permissions.

There is no direct standings mutation schema or engine function. Participant
permissions are read-only; court staff permissions are score-entry only.

## Residual risks and ownership

- Full validation of score values against a division's selected best-of and
  points/win-by configuration remains future API/service input-validation work.
  Owner: Backend/API Integrator.
- Same-pool rematch avoidance is deterministic for this first qualifier mapping
  slice, but more complex K/pool distributions may need a constraint-based
  placement enhancement. Owner: Backend/API Integrator with Mobile Architect.
- HTTP method/path, auth/session, retry/loading, persistence, migration, and
  runtime service evidence remain intentionally unscoped. Owner: Product/
  Planning before a future Backend/API service packet.
- No production, provider, money, deployment, secret, or external-proof action
  was performed.

# Mobile Jest Resolver Fix Evidence

- Baseline: `80cd0a0ee309d15224459920950ab91b22024319`
- Branch: `fix/mobile-jest-pool-ko-resolver`
- Material implementation path: `apps/mobile/package.json`
- Plan review:
  `.evidence/deploy/2026-07-28-railway-dev/mobile-jest-resolver-fix/plan-review.md`

## Change

Added one mobile Jest `moduleNameMapper` entry:

`^\\./pool-ko\\.js$` →
`<rootDir>/../../packages/contracts/src/pool-ko.ts`

No contract, runtime source, dependency, lockfile, UI, external platform, or
secret-bearing file changed.

## Verification

- Pre-change focused Jest: exit 1, expected failing baseline; unable to resolve
  `./pool-ko.js` from `packages/contracts/src/index.ts`.
- Post-change focused Jest: exit 0; 1 suite and 5 tests passed.
- `pnpm test`: exit 0; contracts 38 tests, API 98 tests, and mobile 72 tests
  passed.
- `pnpm build`: exit 0; contracts TypeScript build and Expo web export passed.
- `pnpm turbo run lint test`: exit 0; 7 tasks passed.
- `pnpm run test:runtime`: exit 1 in `validate:work-units` because the
  pre-existing `docs/plans/work-units/pool-ko-tournament/status.json` is not
  `wu-status/v1` and lacks valid stage/state/owner fields. The out-of-scope
  status artifact was not modified and the failed gate was not bypassed.
- `git diff --check`: exit 0.

## Residual risk and handoff

- The Jest resolver failure is fixed and all requested tests/build checks pass.
- Full PR readiness remains blocked by the pre-existing work-unit status schema
  failure until its owning workflow repairs it in a separately authorized
  scope.
- Final `wm-implementation-reviewer` evidence:
  `.evidence/deploy/2026-07-28-railway-dev/mobile-jest-resolver-fix/final-review-rerun-2.md`.
  Verdict: `NO_GO` for PR readiness because `test:runtime` remains red; the
  reviewer found the resolver implementation correct with no scope issue.

## Deployment gate recheck after Product/Planning status repair

After Room 986 instructed pending deploy execution at 2026-07-28 22:37 KST,
Product/Planning repaired `docs/plans/work-units/pool-ko-tournament/status.json`
to the current `wu-status/v1` validator format without changing runtime code.

Re-run pre-deploy gate command passed:

- `pnpm run test:runtime`: exit 0.
- `pnpm test`: exit 0.
- `pnpm build`: exit 0.
- `git diff --check`: exit 0.

The previous `validate:work-units` blocker is resolved for deployment gating.
Railway deployment remains limited to the approved development server target;
real payment, provider console changes, live money calls, and separate actual
production release remain out of scope.

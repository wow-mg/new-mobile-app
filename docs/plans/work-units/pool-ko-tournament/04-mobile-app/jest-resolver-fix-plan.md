# Mobile Jest Resolver Fix Plan

- Work unit: `pool-ko-tournament`
- Workboard card: `9a2dabb0-b753-430d-8328-d28291b365c2`
- Wake guard: `f664d31e-3f60-4322-96e7-de5569d14ea6`
- Baseline: `80cd0a0ee309d15224459920950ab91b22024319`
- Owner: Mobile App Dev
- Routing: `.evidence/deploy/2026-07-28-railway-dev/codex-role-routing.json`
- Allowed skill: `mobile-app-dev-workflow`
- Required plan/final reviewer: `wm-implementation-reviewer`

## Scope and implementation packet

- Target: mobile Jest resolver configuration only.
- Expected implementation path: `apps/mobile/package.json`.
- First test: reuse the existing failing
  `apps/mobile/__tests__/participant-api-client.test.ts`; its pre-change focused
  run fails because Jest cannot resolve `./pool-ko.js` from the TypeScript
  contracts source index.
- Fix: add the narrow relative-export mapping from `./pool-ko.js` to
  `packages/contracts/src/pool-ko.ts`; do not alter contracts, runtime code, or
  test behavior.
- Evidence path:
  `.evidence/deploy/2026-07-28-railway-dev/mobile-jest-resolver-fix/`.
- Verification sequence: focused mobile Jest; `pnpm test`; then `pnpm build`
  only after tests pass.
- Completion: inspect the material diff and full `git status --short`, then
  obtain final read-only reviewer evidence.

## UI, contract, and architecture applicability

- Route/screen/component/state owner: not applicable; this changes Jest
  configuration only.
- Design option and design handoff: not applicable; no UI changes.
- Five-state matrix: not applicable; no runtime state changes.
- API contract/mock/fixture: existing `packages/contracts/src/index.ts` and
  `packages/contracts/src/pool-ko.ts` remain unchanged and authoritative.
- Architecture handoff: not applicable; package/runtime boundaries remain
  unchanged.
- Stable `testID` impact: none.

## Checkpoints

1. Baseline and plan: preserve the focused failing output, inspect the stash
   candidate, and obtain a `wm-implementation-reviewer` plan verdict before
   implementation.
2. Minimal implementation: apply only the resolver mapping. Because the approved
   change is a single configuration entry matching the reviewed candidate and
   introduces no new material risk, the plan reviewer verdict is the checkpoint
   authority for proceeding directly to verification.
3. Verification and final review: run the focused suite, full tests, and build;
   inspect diff/status; obtain the required final reviewer verdict before Done.

## Non-goals and gates

- No Railway deploy, provider console changes, secrets, live money calls,
  payment, production release, merge, push, or external state change.
- No contract, source, dependency, lockfile, UI, or unrelated metadata changes.
- No self-approval or failed-gate bypass.
- Branch/PR workflow remains required; this session prepares a local handoff
  only.

## Sources of truth

- `AGENTS.md`: TDD, scoped mobile ownership, branch/PR, and verification rules.
- `PROJECT_ENVIRONMENT.md`: workspace test/build graph and current mobile Jest
  environment.
- `.agents/skills/wm/SKILL.md`: plan, tests-first, evidence, checkpoint, and
  reviewer gates.
- `.agents/skills/mobile-app-dev-workflow/SKILL.md` and
  `references/sot.md`: Mobile App Dev ownership and implementation packet.
- `.evidence/deploy/2026-07-28-railway-dev/codex-role-routing.json`: resolved
  role, allowed skill, reviewer, affected scope, and completion commands.
- `apps/mobile/package.json`, `packages/contracts/src/index.ts`, and preserved
  stash `pre-railway-deploy-preserve-local-apps-mobile-package-json`: current
  mapper, failing export, and candidate minimal fix.

## Planning reviewer record

- Agent: `wm-implementation-reviewer`
- Question: Is this the smallest tests-first resolver-only plan, with adequate
  evidence and gate boundaries?
- Conclusion: GO with no Critical/High/Medium findings; final evidence should
  also include the standard runtime and workspace lint/test PR gates.
- Source refs/evidence path:
  `.evidence/deploy/2026-07-28-railway-dev/mobile-jest-resolver-fix/plan-review.md`.
- Reflection/impact: proceed with the single reviewed mapping, then run the
  planned checks plus `pnpm run test:runtime` and `pnpm turbo run lint test`
  before final review.

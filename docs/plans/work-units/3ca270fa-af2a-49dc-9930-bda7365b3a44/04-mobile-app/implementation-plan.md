# Kakao Post-API Processing — Mobile Implementation Plan

## Plan packet

- Work unit: `3ca270fa-af2a-49dc-9930-bda7365b3a44`.
- Owner: Mobile App Dev. Backend/API Integrator ownership is unchanged; this work consumes the existing shared Kakao callback/continue contract and existing dirty API implementation without expanding it.
- Route/screen/state owner: Expo Router `/` (`Home`/`LoginScreen`) owns callback continuation status; existing `/auth/additional-info`, `/signup-complete`, and `/tournaments` remain the destination routes.
- Source of truth: `AGENTS.md`; `PROJECT_ENVIRONMENT.md`; `.agents/skills/wm/SKILL.md`; `.agents/skills/mobile-app-dev-workflow/SKILL.md`; `.agents/skills/mobile-app-dev-workflow/references/sot.md`; `mobile-app-dev-team/runtime-sources/role-souls/mobile-app-dev-soul.md`; `mobile-app-dev-team/governance/gates-and-evidence.md`; `packages/contracts/src/index.ts`; existing `docs/plans/work-units/kakao-callback-continue-flow/{03-contract-api,04-mobile-app}/implementation-plan.md`.
- Selected Design option/handoff: preserve the existing login screen and additional-info screen; this task adds status copy in the existing callback-result area and introduces no new visual option, layout, component family, or route. This is an explicit design-gap containment decision based on the requested loading/failure behavior.
- State matrix: default shows the login screen; loading reports that Kakao login is being completed; empty/not-applicable has no callback status; error reports safe retry guidance without response/token details; permission-denied/blocked uses the bounded callback message already supported; success primes only the sanitized dev-session snapshot and navigates signup to `/signup-complete`, login to `/tournaments`; additional-info-required stays on the existing branch to `/auth/additional-info`.
- API contract/mock: `kakaoAuthCallbackRedirectSchema`, `kakaoAuthContinueRequestSchema`, and `kakaoDevAuthSuccessSchema` in `packages/contracts`; injected `KakaoAuthClient` is the test seam. No ad-hoc response type or backend contract change.
- Architecture: no dependency, runtime, persistence backend, or route-family change. The existing module-memory dev-session snapshot remains development-only and intentionally excludes the access token.
- First test: add narrow `Home` tests proving visible continuation loading, visible safe failure, no session prime/navigation on failure, and existing login/signup navigation remains intact.
- Stable selectors: add one kebab-case `kakao-auth-continuation-status`; no existing selector changes.

## Checkpoints

1. Tests first: update `apps/mobile/src/app/__tests__/home.test.tsx`, run the targeted test, and capture the expected red result under `.evidence/3ca270fa-kakao-post-api/`.
2. Smallest implementation: update only `apps/mobile/src/app/index.tsx` to own loading/error state and render status; rerun the targeted test. Review the checkpoint against this plan, scoped diff, command result, and evidence before proceeding.
3. Final verification: run mobile targeted test and lint, safe shared contract/API targeted tests only if required by the already-dirty integration surface, `git diff --check`, scoped diff, and full `git status --short`; obtain final read-only implementation review.

## Evidence, gates, and handoff

- Evidence root: `.evidence/3ca270fa-kakao-post-api/`; reviewer reports under `reviews/`.
- Planned commands: `pnpm --filter @template/mobile test -- home.test.tsx`; `pnpm --filter @template/mobile lint`; `pnpm --filter @template/contracts build`; `node packages/contracts/__tests__/kakao-auth-contract.test.mjs`; `pnpm --filter @template/api test -- kakao-auth.test.ts`; `git diff --check`.
- Full workspace gate is required for PR readiness but may be reported as not run if it exceeds the user's safe targeted-check boundary; no failed gate will be waived.
- Visual/native QA is not applicable to this copy-only state addition with no layout/native module change; QA/Release retains live OAuth/device-smoke ownership.
- Plan reviewer and final reviewer: read-only `wm-implementation-reviewer`; contract reviewer is source-backed not required for the new delta because no shared/API contract change is planned.

## Non-goals and blockers

- Preserve all existing uncommitted work; do not rewrite unrelated Kakao, privacy, logo, participant, environment, or planning changes.
- No secret/env reads, Kakao console work, dependency changes, live OAuth, deploy, release, push, merge, or external readiness proof.
- No production session persistence design. `SERVICE_REST_API_KEY` and a configured callback environment remain required for live smoke and are a QA/Release residual blocker, not a local implementation blocker.
- Completion requires tests/evidence, checkpoint/final reviewer verdicts, material scoped diff details, and full `git status --short`.

# Kakao Callback Continue Flow — 2026-07-22 Follow-through Plan

## Plan packet

- Work unit: `kakao-callback-continue-flow`
- Workboard guard: `7e9bffb1-9691-4c12-a2ab-c0283a7b7a62`
- Owner: Mobile App Dev for Expo route/client wiring; Backend/API Integrator for callback and session/account contract behavior.
- Source of truth: `AGENTS.md`; `PROJECT_ENVIRONMENT.md`; `.agents/skills/wm/SKILL.md`; `.agents/skills/mobile-app-dev-workflow/SKILL.md`; `.agents/skills/mobile-app-dev-workflow/references/sot.md`; `mobile-app-dev-team/runtime-sources/role-souls/mobile-app-dev-soul.md`; `mobile-app-dev-team/governance/gates-and-evidence.md`; `docs/plans/work-units/kakao-callback-continue-flow/00-product-planning/codex-routing-artifact.json`; `docs/plans/work-units/privacy-policy-kakao-profile-fields/00-product-planning/codex-routing-artifact.json`.
- Target routes/state owners: API `/auth/kakao`, `/auth/kakao/callback`, and `/auth/kakao/additional-info`; mobile `/`, `/auth/additional-info`, `KakaoAdditionalInfoScreen`, and `kakao-auth-client`.
- Expected affected paths: `apps/api/src/routes/kakao-auth.ts`, `apps/api/src/routes/__tests__/kakao-auth.test.ts`, `apps/mobile/src/app/index.tsx`, `apps/mobile/src/app/__tests__/home.test.tsx`, `apps/mobile/src/auth/kakao-auth-client.ts`, shared Kakao contracts/tests only if alignment is required, and `.evidence/kakao-login-complete-20260722/**`.
- Design handoff/selected option: preserve the already shipped additional-info form described in `docs/plans/work-units/9e8da750-8ef9-45cc-9534-dcba31b7e3ca/04-mobile-app/implementation-plan.md`; no new visual option, component, or route family is introduced.
- Stable `testID` impact: none expected; the existing `privacy-policy-screen` selector remains unchanged.
- API contract status: preserve the existing explicit JSON callback response for direct API calls. A state-bound successful callback stores the already-created `kakaoDevAuthSuccessSchema` result behind an opaque, one-time, ten-minute UUID `outcomeId`, then redirects only `action=auth_complete&outcomeId=<uuid>` to the allowlisted app return. The mobile app exchanges that identifier once through `POST /auth/kakao/continue` using `kakaoAuthContinueRequestSchema` and receives `kakaoDevAuthSuccessSchema`; the API deletes expired or consumed outcomes and returns the shared blocked/error shape otherwise. No provider credential, OAuth code, Kakao access token, dev-session access token, member PII, or bearer token is put in the URL.
- Contract SoT: add shared schemas/types for callback redirect outcomes, direct additional-info/blocked responses, the `POST /auth/kakao/continue` request, and blocked errors in `packages/contracts`; remove the hand-written mobile callback union in favor of those shared types and bounded schema parsing.
- Architecture note: smallest dev-friendly contract is state-bound, one-time/expiring return metadata, not an arbitrary callback query redirect. Return targets must be configured/allowlisted; no production configuration or deployment changes.

## State matrix

| State | Expected continuation |
| --- | --- |
| Default/success | Redirect state-bound signup/login callbacks with only `action=auth_complete` and a one-time UUID `outcomeId`; mobile exchanges it once with the API, primes the returned sanitized dev-session snapshot, and continues to `/signup-complete` for signup or `/tournaments` for login. Direct callbacks retain JSON. |
| Loading | Existing system-browser/auth-session loading remains owned by the mobile client; no new UI. |
| Additional information | Redirect to the existing signup/additional-info flow using a short-lived continuation identifier; do not expose provider or session credentials. |
| Error/blocked | Return a safe outcome/message to the state-bound target when supported; direct API clients retain structured error JSON. |
| Permission denied/cancelled | Preserve existing provider/callback error behavior; no new permission UI is introduced. |

## Tests-first and checkpoints

1. **Checkpoint 1 — tests first:** add failing contract assertions for all new shared callback/continue shapes; API assertions for state-bound signup and repeated-login redirects, one-time/expired outcome exchange, and retained direct JSON; plus mobile route-parameter tests proving `auth_complete` is schema-parsed, exchanged through the real client, routes signup/login correctly, preserves the forged raw-session-param rejection, and invokes the real default additional-info client. Run the narrow contract/API/mobile tests and persist the red/expected-failure result.
2. **Checkpoint 2 — smallest implementation:** implement the one-time outcome store and `POST /auth/kakao/continue`, redirect valid state-bound success using only the shared bounded outcome shape, parse with shared schemas on mobile, consume the outcome through `defaultKakaoAuthClient`, and wire `KakaoAdditionalInfoScreen` to `defaultKakaoAuthClient.completeAdditionalInfo`. Run contract build/test and narrow API/mobile tests. Obtain checkpoint read-only contract and implementation review using the approved plan, diff, command results, evidence path, and remaining impact.
3. **Final verification/review:** run `git diff --check`, the requested contract/API/mobile commands, write `.evidence/kakao-login-complete-20260722/result.md`, inspect scoped `git diff` and full `git status --short`, then obtain final read-only verdicts from `wm-implementation-reviewer`, `wm-contract-reviewer`, and routing-required `po-planning-reviewer`.

## Evidence and gates

- Evidence: `.evidence/kakao-login-complete-20260722/result.md`; plan/checkpoint/final reviewer reports under `.evidence/kakao-login-complete-20260722/reviews/`.
- Narrow commands: `pnpm --filter @template/contracts build`; `node packages/contracts/__tests__/kakao-auth-contract.test.mjs`; `pnpm --filter @template/api test -- kakao-auth.test.ts`; `pnpm --filter @template/mobile test -- home.test.tsx participant-shell.test.ts`.
- Workspace gate: `pnpm turbo run lint test` is required for PR readiness; failures are binding and will be reported, not bypassed.
- Runtime/local-harness gates: not applicable unless Codex runtime artifacts are changed.
- Visual/native QA: not applicable because no visual layout, native module, or selector changes are planned.

## Non-goals, blockers, and human gates

- No Kakao console, Railway, EAS, store, production configuration, deployment, or external state changes.
- No provider OAuth code, access token, session token, credential, or user-supplied secret in logs, evidence, URLs, or committed examples.
- No persistent production session design; the current in-memory members, pending outcomes, and dev-session behavior remain explicitly development-only. The outcome identifier is an opaque one-time handoff, never logged or persisted by mobile, and is not a production authentication design.
- Existing unrelated dirty changes, including privacy/logo/copy work, are preserved and excluded from this follow-through.
- Existing dirty auth changes are preserved; unrelated churn is forbidden.
- Completion requires command outcomes, required reviewer verdicts without self-approval, scoped `git diff`, and full `git status --short`.

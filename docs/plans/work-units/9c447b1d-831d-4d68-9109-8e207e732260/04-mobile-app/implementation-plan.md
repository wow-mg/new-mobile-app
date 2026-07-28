# PickleHub social login configuration-awareness plan

- status: required
- PRD acceptance line: make the existing social login/signup surface aware of confirmed Kakao environment key names while remaining dev/sandbox-safe and making no live OAuth claim
- owner: Mobile App Dev
- input artifact: `/workspace/artifacts/picklehub-real-routes/codex-role-routing-9c447b1d.json`
- output artifact: this `04-mobile-app/` implementation and evidence packet
- work-unit ID: `9c447b1d-831d-4d68-9109-8e207e732260`
- route/screen/component/state owner: `/`, `LoginScreen`, Mobile App Dev; `/signup` remains unchanged
- selected Design option: preserve the existing login artboard and social-button layout in `apps/mobile/src/app/index.tsx`; no new Design option or visual interpretation is required for status-copy-only behavior
- Design handoff path: explicit design gap accepted by the bounded routing artifact; no approved external handoff exists, so visual structure, colors, logo, routes, and selectors must remain unchanged
- state matrix: default shows a safe provider-status message; loading, empty, error, and permission-denied remain not applicable because this slice starts no provider request and adds no asynchronous state
- API contract/mock/fixture: not applicable; no API call, auth/session behavior, token handling, mock, or shared schema changes are authorized
- architecture note: not applicable; no route, navigation, dependency, session, or provider runtime integration changes
- first test: add focused configuration tests proving key-presence booleans without recording values, then update the login component test to prove buttons remain disabled and copy is honest
- stable `testID` impact: none; preserve `kakao-login-button`, `apple-login-button`, and `social-login-pending-copy`
- affected paths: `apps/mobile/app.config.ts`, `apps/mobile/src/auth/social-login-config.ts`, `apps/mobile/src/app/index.tsx`, focused Jest tests, `PROJECT_ENVIRONMENT.md`, and this work-unit evidence directory
- evidence path: `docs/plans/work-units/9c447b1d-831d-4d68-9109-8e207e732260/04-mobile-app/`
- expected commands: focused mobile Jest tests first; `pnpm --filter mobile test`; `pnpm --filter mobile lint`; `pnpm --filter mobile exec expo install --check`; `pnpm --filter mobile run doctor`; repo-required `pnpm run test:runtime`; repo-required `pnpm turbo run lint test`; `git diff --check`; final diff/status inspection
- plan reviewer: `wm-implementation-reviewer`
- contract reviewer/handoff preservation: `wm-contract-reviewer`
- final reviewers: `wm-implementation-reviewer` and `wm-contract-reviewer`
- gate impact: local L0 Jest/lint/config evidence plus serial `mobile-mcp` visual QA when a simulator/device is available; if unavailable, record that fact and native visual/human-device residual risk without claiming proof
- non-goals: live Kakao or Apple OAuth, enabling provider buttons, backend auth/API contracts, signup submission, dependencies, payment/refund flow, deploy/push/merge/PR/release, external consoles, or external readiness proof
- blockers/human gates: real provider integration remains blocked on secure credential delivery, provider/backend contracts, platform configuration, and explicit approval; key presence is not OAuth readiness
- completion requirement: record plan, checkpoint, and final reviewer evidence; report `git diff --stat`, `git diff --check`, relevant tests, full `git status --short`, and secret-safety confirmation

## Source-of-truth decisions

- The routing and role decision comes from the supplied `codex-role-workflow/v1` artifact: status `ready`, role `Mobile App Dev`, stage `04-mobile-app`, and both required reviewers.
- Repo boundaries, TDD, NativeWind/RN requirements, and verification come from `AGENTS.md`, `PROJECT_ENVIRONMENT.md`, `.agents/skills/wm/SKILL.md`, `.agents/skills/mobile-app-dev-workflow/SKILL.md`, and its `references/sot.md`.
- The existing UI/test baseline comes from `apps/mobile/src/app/index.tsx`, `apps/mobile/__tests__/participant-shell.test.ts`, and `apps/mobile/src/app/__tests__/home.test.tsx` at baseline `6090ec8`.
- Secret handling comes from the routing artifact and task: only the names `SERVICE_NATIVE_APP_KEY`, `SERVICE_REST_API_KEY`, and `SERVICE_JAVASCRIPT_KEY` may be referenced; values and `DEFINE.env` must not be read.

## Checkpoints

1. Tests-first/config boundary: add failing focused tests for redacted key-presence detection and disabled/honest UI; run only those tests; review the plan plus checkpoint diff/output before implementation.
2. Minimal implementation: add boolean-only Expo extra/config parsing and status copy while preserving disabled controls/routes; run focused tests and obtain a bounded checkpoint review.
3. Verification/handoff: run applicable mobile and workspace gates, inspect final diff/status, and obtain final actual-work reviews from both required reviewers.

## Planning review routing record

- agent: `wm-implementation-reviewer`; question: is the scope, TDD sequence, evidence, UI/runtime boundary, and checkpoint plan safe and complete?; conclusion: pending; source refs/evidence path: this file; reflection/impact: implementation cannot begin until a GO verdict.
- agent: `wm-contract-reviewer`; question: does boolean-only configuration awareness avoid API/auth contract invention and preserve the later provider handoff?; conclusion: pending; source refs/evidence path: this file; reflection/impact: any contract finding will be handed to Backend/API Integrator rather than implemented here.
- reviewer selection: dedicated `wm-*` read-only agents are sufficient; Product/Planning and Design agents are not needed because routing already bounds the task and the visual design is preserved.

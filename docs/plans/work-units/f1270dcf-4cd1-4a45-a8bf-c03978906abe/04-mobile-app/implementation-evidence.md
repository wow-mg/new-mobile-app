# 04 Mobile App Implementation Evidence

Workboard card: f1270dcf-4cd1-4a45-a8bf-c03978906abe
Repo-local evidence: `.evidence/wm/picklehub-real-routes/command-output.md`
Session evidence mirror: `/workspace/artifacts/picklehub-real-routes`

## Summary

Converted the PickleHub participant MVP from one internal `activeScreen` route-state shell into Expo Router page routes for:

- `/tournaments`
- `/tournaments/[id]`
- `/tournaments/[id]/apply`
- `/dupr-profile`
- `/support`

Existing reference bottom-nav surfaces are also routable as `/games`, `/notifications`, and `/mypage`.

## Validation Status

Passing evidence is recorded in `.evidence/wm/picklehub-real-routes/command-output.md` and mirrored by session logs under `/workspace/artifacts/picklehub-real-routes`.

Post-approval updates completed:

- Expo SDK 56 patch drift was resolved under explicit room approval.
- `pnpm --filter mobile exec expo install --check` now reports dependencies up to date.
- `pnpm --filter mobile run doctor` now passes 21/21 checks.
- `pnpm run test:runtime` passes after `PROJECT_ENVIRONMENT.md` was synchronized to the approved Expo patch versions.
- Post-20:30 safe validation also passes after the RN Web E2E contract import-path fix: `git diff --check`, `pnpm --filter @template/contracts build`, mobile lint, mobile Jest 4 suites / 29 tests, and `pnpm run test:runtime`.
- Codex CLI updated to `0.144.1`; no-approval smoke returned `CODEX_SMOKE_OK`.
- After explicit room approval on 2026-07-13, Playwright Chromium was installed using `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright` to avoid `/root` cache space pressure.
- RN Web E2E now passes: `pnpm --filter @template/contracts build && PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright pnpm --filter mobile e2e:web` passed with 1 Chromium test passed and 1 backend reachability test skipped.
- Final pre-commit validation passed: `git diff --check`, mobile lint, mobile Jest 4 suites / 29 tests, contracts test/build, API test/lint, `pnpm run test:runtime`, and `pnpm run validate:evidence-hygiene`.

Known blockers / residual evidence gaps:

- No mobile-mcp simulator/device was available, so native visual QA could not be run.
- Railway redeploy evidence is pending until the approved deploy command completes.

## External Proof Boundary

This local evidence does not prove Railway redeploy, production/release readiness, live provider/payment behavior, real DUPR integration, or native-device visual behavior.

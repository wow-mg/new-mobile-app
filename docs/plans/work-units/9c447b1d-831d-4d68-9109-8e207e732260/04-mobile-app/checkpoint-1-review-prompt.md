Mode: scope. Read-only checkpoint review; do not edit or delegate.

Approved plan: docs/plans/work-units/9c447b1d-831d-4d68-9109-8e207e732260/04-mobile-app/implementation-plan.md
Checkpoint evidence: docs/plans/work-units/9c447b1d-831d-4d68-9109-8e207e732260/04-mobile-app/checkpoint-1.md
Checkpoint diff paths: apps/mobile/__tests__/app-config.test.ts and apps/mobile/src/app/__tests__/home.test.tsx
Command output: focused Jest run failed as expected with 2 failed suites, 4 failed tests, and 16 passed tests because app config lacks boolean-only Kakao presence flags and login status copy is not configuration-aware.
Remaining plan: implement the narrow boolean-only config module, Expo extra mapping, and status copy; keep provider buttons disabled and preserve routes/selectors.

Confirm this is valid tests-first evidence, uses placeholders only, prevents config values from entering Expo extras, and remains within the approved plan. Return the required wm-implementation-reviewer verdict envelope. Treat the expected failing test command as PASS for the TDD checkpoint if it fails for the intended missing behavior.

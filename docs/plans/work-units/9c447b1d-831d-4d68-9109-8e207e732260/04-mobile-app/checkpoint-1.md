# Checkpoint 1: tests-first/config boundary

- approved plan: `implementation-plan.md`
- checkpoint diff: tests only in `apps/mobile/__tests__/app-config.test.ts` and `apps/mobile/src/app/__tests__/home.test.tsx`; no implementation source changed
- command: `pnpm --filter mobile test -- --runInBand __tests__/app-config.test.ts src/app/__tests__/home.test.tsx`
- result: expected FAIL; 2 suites failed, 4 tests failed, 16 tests passed
- failure proof: Expo config lacks boolean-only `extra.socialLogin.kakao`; login copy does not yet distinguish absent versus detected configuration
- secret safety: placeholder strings only; test asserts serialized Expo extras contain no placeholder key material
- evidence path: this file plus the test diff
- remaining plan impact: implement the exact boolean model and copy selection; buttons, routes, selectors, API/session behavior, and signup remain unchanged
- reviewer verdict: pending `wm-implementation-reviewer`

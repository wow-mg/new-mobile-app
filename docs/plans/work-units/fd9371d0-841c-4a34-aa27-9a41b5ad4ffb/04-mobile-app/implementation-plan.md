# Development Participant Payment Connection — Mobile Plan

- Work unit / Workboard card: `fd9371d0-841c-4a34-aa27-9a41b5ad4ffb`
- Owner: Mobile App Dev
- Routes/screens: tournament apply, payment, mypage/reservation
- State owner: existing module-local participant flow store in
  `apps/mobile/src/app/index.tsx`
- Baseline: `fix/mobile-jest-pool-ko-resolver` at `5f78281a927b7aafbb88d7d788d2ae357454a19f`

## SoT-grounded scope

Sources used: `AGENTS.md`, `PROJECT_ENVIRONMENT.md`,
`.agents/skills/wm/SKILL.md`, both applicable workflow skills and
`references/sot.md` maps, both role SOULs,
`mobile-app-dev-team/governance/gates-and-evidence.md`, existing schemas in
`packages/contracts/src/index.ts`, existing routes/services under
`apps/api/src/{routes,services}`, and existing RN implementation/tests under
`apps/mobile/src`.

The smallest MVP is one development-only, session-authenticated path:

1. Hold the returned participant dev-session access token in process memory
   only and construct the existing participant API client from the configured
   public API base URL plus that token.
2. Submit/confirm the existing tournament application through the backend.
3. Refresh mypage once after application creation and consume the existing
   operator-managed offline payment record/status. Do not invoke the sandbox
   order endpoints because their non-test service can be HTTP-provider-backed.
4. Render application, record/reference, amount, mode, and current status on the
   payment/mypage UX with loading, error, and retry/status-refresh behavior.
5. Continue to route refund handling to the existing operator-managed 1:1
   inquiry UX; surface actual backend payment/refund-related status rather than
   static “not connected” copy.

## UI states and design decision

No new visual design or route is introduced. The selected option is the
existing Payment/Mypage layout and semantic palette in
`apps/mobile/src/app/index.tsx`; this task only replaces static readiness copy
with contract-backed state.

| State | Behavior |
| --- | --- |
| default | Existing application and contract-backed operator-managed payment summary |
| loading | Announce application/payment status refresh |
| empty | Explain that application is required before a payment order |
| error | Show a non-sensitive Korean failure state and retry action |
| permission denied | Treat 403/session failure as unavailable and require dev login again; no fallback success claim |

Stable selectors added or updated: `payment-status-refresh`,
`payment-backend-status`, and `payment-record-reference`. Existing selectors
are preserved.

## Tests-first checkpoints

1. Contract/auth checkpoint: focused API route test proving dev-session access
   to participant application/mypage plus denial at every payment-provider
   endpoint. Review with `wm-contract-reviewer`.
2. Mobile checkpoint: focused Jest tests proving the application call, mypage
   refresh, and UI transition from submitted application to backend
   operator-managed payment status. Review with `wm-implementation-reviewer`.
3. Final checkpoint: targeted tests, API/mobile lint, `git diff --check`, broader
   feasible workspace checks, diff/status inspection, and final
   `wm-implementation-reviewer` review.

Evidence will be stored under
`.evidence/wm/fd9371d0-841c-4a34-aa27-9a41b5ad4ffb/`.
Serena is unavailable, so navigation uses focused `rg` and bounded file reads.

## Gate and handoff boundaries

Expected commands: focused API Vitest and mobile Jest first; contracts/API/mobile
lint/tests next; `pnpm turbo run lint test`; `pnpm run test:runtime`; and
`git diff --check`. L0 is the immediate evidence level; no simulator/device is
currently claimed, so visual/native evidence remains a QA residual risk.

Non-goals: new route, broad refactor, design change, dependency/config change,
real payment, live provider, provider console, secret persistence/logging,
deployment, push, PR, or merge. Deployment stays blocked until the supervisor
reports to Room 986 and receives explicit go-ahead.

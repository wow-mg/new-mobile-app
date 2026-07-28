# Workboard 3E Mobile Implementation Plan

Work unit: `3bcaec22-d5d9-4d33-aa78-7c449aae7605`

Stage: `04-mobile-app`

Owner: Mobile App Dev

Workflow invocation: `/wm`

Goal: wire the existing mobile payment and refund screens to the shared backend
payment/refund contracts with fetch-boundary Zod validation and narrow tests,
without live provider calls.

## Verified sources of truth

- `AGENTS.md`: tests-first delivery, `packages/contracts` as the shared contract
  SoT, NativeWind/React Native UI constraints, stable selectors, and workspace
  verification.
- `PROJECT_ENVIRONMENT.md`: Expo SDK 56 mobile baseline, API/client public
  configuration boundary, sandbox-only payment runtime, and evidence gates.
- `.evidence/workboard-3bcaec22-3E/codex-role-routing.yaml`: resolved Mobile App
  Dev owner, `04-mobile-app` stage, allowed skill, required reviewers, accepted
  execution state, and no-live-provider boundary.
- `.agents/skills/{wm,mobile-app-dev-workflow}/SKILL.md` and
  `.agents/skills/mobile-app-dev-workflow/references/sot.md`: plan, TDD,
  checkpoint, reviewer, evidence, diff, and role-boundary requirements.
- `mobile-app-dev-team/runtime-sources/role-souls/mobile-app-dev-soul.md` and
  `mobile-app-dev-team/governance/gates-and-evidence.md`: payment escalation,
  implementation authority, and local-vs-external proof limits.
- `packages/contracts/src/index.ts` and
  `packages/contracts/src/fixtures/{payment,refund}.ts`: strict request,
  response, error, payment status, refund request/history schemas, and sandbox
  examples created by backend cards 3B-3D.
- `docs/plans/work-units/40754bdd-be47-4977-a8af-9fb2e60bebb2/03-contract-api/implementation-plan.md`
  and
  `docs/plans/work-units/5b911e17-e92f-47f4-b1a6-fe1ce24ad8ec/03-contract-api/{api-contract-plan,service-evidence}.md`:
  participant endpoints, auth/error/idempotency behavior, verified backend
  checks, and mock-only refund/provider boundary.
- Existing mobile baseline:
  `apps/mobile/src/app/{index,payment,payment-complete,payment-failure,cancel-confirm,cancel-complete}.tsx`,
  `apps/mobile/src/participant/api-client.ts`, and current Jest suites.

## Implementation packet

- Routes/screens: preserve the existing `/payment`, `/payment-complete`,
  `/payment-failure`, `/cancel-confirm`, and `/cancel-complete` exports.
  `index.tsx` remains the screen/state owner; the participant API client owns
  HTTP and Zod boundary mapping.
- Design selection/gap: no dedicated 3E `01-design` handoff was found. This
  task therefore selects the existing checked-in screen composition as the
  visual baseline and permits no visual redesign. If reviewers determine that
  contract-driven state/copy cannot be implemented without a new design
  decision, implementation stops for Design ownership.
- API contracts:
  - `POST /api/payments/orders`:
    `createPaymentOrderRequestSchema` → `paymentOrderResponseSchema`.
  - `GET /api/payments/:paymentRecordId`:
    `paymentOrderResponseSchema`.
  - `POST /api/payments/:paymentRecordId/reconcile`:
    `reconcilePaymentRequestSchema` → `paymentOrderResponseSchema`.
  - `POST /api/payments/:paymentRecordId/refunds`:
    `createRefundRequestSchema` → `refundRequestSchema`.
  - `GET /api/payments/:paymentRecordId/refunds`:
    `refundHistoryResponseSchema`.
  - API failures parse `paymentApiErrorResponseSchema`; malformed success
    payloads fail closed through the applicable strict Zod schema.
- Blocking auth/session handoff: the current payment routes accept only the
  server-private `PARTICIPANT_PREVIEW_BEARER_TOKEN`, while the current mobile
  client reads `EXPO_PUBLIC_PARTICIPANT_API_BEARER_TOKEN`. Repo policy forbids
  bearer credentials in compiled `EXPO_PUBLIC_*` values. Backend/API Integrator
  must provide a payment/refund authorization boundary that accepts a
  mobile-held authenticated session token (or another explicitly approved
  secret-safe contract) before real endpoint wiring can execute. Mobile App Dev
  will not copy, expose, or embed the preview bearer.
- State matrix:
  - default: application/payment summary and selectable supported payment mode;
    cancellation shows server-backed refund details when available.
  - loading: order creation/status refresh/refund submission disables duplicate
    actions and exposes stable loading status text.
  - empty: absent application/payment record explains that no actionable
    payment/refund exists and retains support fallback.
  - error: contract/network/backend failure exposes retry for safe reads/order
    retry initiated by the user and a support fallback; mutating refund request
    is never automatically retried.
  - permission denied: `PAYMENT_FORBIDDEN` and ownership mismatch map to a
    fail-closed access message plus support fallback.
  - terminal additions required by acceptance: paid success routes/shows real
    response timestamps and mode; failed payment supports user-triggered retry;
    `operatorReview` refund renders in-review status/history timestamp.
- Architecture note: no new dependency, route, provider SDK, deep-link handler,
  polling timer, or global architecture is planned. The current backend exposes
  create/read/reconcile APIs but no provider redirect URL contract; therefore
  the mobile flow uses explicit create and user-triggered status refresh/
  reconcile, without inventing a redirect or retry cadence.
- Idempotency note: one logical order attempt must create one valid
  `idempotencyKey` and retain/reuse it for any user-triggered retry after an
  unknown outcome. A fresh key is allowed only after a terminal failed outcome
  starts an explicitly new logical attempt. Automatic create-order retry is
  forbidden. Tests must prove key reuse before implementation.
- First tests:
  1. extend `participant-api-client.test.ts` to prove request/response Zod
     parsing and malformed-success rejection for payment/refund methods;
  2. add focused component behavior for paid success, failed payment retry, and
     refund `operatorReview`, using injected client responses.
- Stable `testID` impact: preserve existing selectors and add only kebab-case
  state/action selectors needed by tests. No existing selector rename.
- Intended source/test paths:
  `apps/mobile/src/participant/api-client.ts`,
  `apps/mobile/src/app/index.tsx`,
  `apps/mobile/__tests__/participant-api-client.test.ts`, and the narrowest
  existing screen component test. Route export files change only if required.
- Evidence root:
  `.evidence/wm/3bcaec22-d5d9-4d33-aa78-7c449aae7605/`.
- Verification:
  focused Jest tests; `pnpm --filter mobile lint`;
  `pnpm --filter mobile test`; `pnpm turbo run lint test`;
  `pnpm run test:runtime`; `git diff --check`. `test:local-harness` is not
  applicable unless a Codex runtime-controlled path changes. Expo install
  check/doctor and device visual QA are not runtime-environment requirements
  for this data-wiring-only slice; visual QA remains a QA handoff unless an
  available device is deliberately used.
- Reviewers: `wm-implementation-reviewer` and `wm-contract-reviewer` at plan,
  contract/tests-first checkpoint, implementation checkpoint, and final actual
  work review.

## Checkpoints

1. **Plan gate:** both required reviewers inspect this packet, routing, schemas,
   backend handoffs, current UI/tests, dirty baseline, and design-gap
   containment. Both must return `GO`.
2. **Tests-first gate:** add the narrowest failing client/component tests, run
   them to capture expected failure, inspect checkpoint diff, and provide the
   plan, diff, output, evidence path, and remaining-plan impact to both
   reviewers. Findings must be resolved before implementation.
3. **Implementation gate:** implement only the contract-validated client and
   existing-screen state wiring necessary for the tests. Run focused checks,
   inspect scoped diff, and obtain both checkpoint verdicts before broad gates.
4. **Final gate:** run applicable workspace/runtime checks; both reviewers
   assess the approved plan, actual diff, command output, evidence, contract
   drift, and mock-only/human-gate boundary. Completion requires final `git
   diff` inspection and full `git status --short`.

## Non-goals and gates

- No backend, database, shared contract, provider SDK, credential, deployment,
  external platform/repository, production, live charge/refund, or automatic
  provider call.
- No API contract invention, unrelated refactor, design overhaul, dependency
  installation, metadata churn, push, merge, or direct-main work.
- Existing unrelated dirty changes, including the in-progress backend/contracts
  work that supplies 3B-3D, are preserved.
- Current plan-gate state: `NO_GO`. Both required reviewers identified the
  unresolved secret-safe payment/refund auth/session boundary as High severity.
  No tests or app implementation may start until Backend/API Integrator returns
  a contract/handoff and both plan reviews are rerun to `GO`.
- The approved sandbox/test payment gate does not authorize live provider
  behavior. Production merchant behavior, real money movement/refunds, and
  external proof remain human-gated and outside this run.

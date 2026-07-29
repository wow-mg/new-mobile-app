Review the API plan in mode=plan, read-only.

Baseline: 5f78281a927b7aafbb88d7d788d2ae357454a19f.
Target:
docs/plans/work-units/fd9371d0-841c-4a34-aa27-9a41b5ad4ffb/03-contract-api/implementation-plan.md

Question: Is the existing-contract, participant-dev-session auth bridge plus
mypage-only operator-managed payment record the smallest safe local-only way
to connect participant application/payment status once, while explicitly
excluding every `/api/payments/*` endpoint, provider call, and money movement?

Review AGENTS.md, PROJECT_ENVIRONMENT.md, packages/contracts/src/index.ts,
apps/api/src/app.ts, apps/api/src/services/participant-session.service.ts,
apps/api/src/routes/participant-mvp.ts, apps/api/src/routes/payments.ts, and
the target plan. Planning checks are source inspection; implementation tests
are not yet expected. Return the required verdict envelope. In the JSON,
use `backend_api_integrator`, `mobile_app_dev`, `qa_release`, or `human_gate`
for finding owners.

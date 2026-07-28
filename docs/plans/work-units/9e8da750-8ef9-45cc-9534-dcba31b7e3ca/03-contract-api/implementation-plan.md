# Kakao Missing-Email Dev Completion — API Contract Plan

- Work unit: `9e8da750-8ef9-45cc-9534-dcba31b7e3ca`
- Consuming flow/owner: mobile `/auth/additional-info`; Backend/API Integrator owns this contract.
- Endpoint: `POST /auth/kakao/additional-info`.
- Request: `kakaoAdditionalInfoRequestSchema` (opaque UUID `continuationToken`, normalized valid `email`, non-empty `displayName`, optional `phone`).
- Success: `kakaoDevAuthSuccessSchema`; `201 signup` with the existing dev member/session shape. Errors use the existing blocked response with duplicate or non-pending reason.
- Auth/session: completion is allowed only with an opaque, one-time, ten-minute continuation bound to an email-missing Kakao callback. OAuth state binds the optional mobile deep-link return. Pending state remains dev-only and in-memory; later callbacks use the existing login behavior.
- Retry: a successful completion consumes pending state; a duplicate conflict retains it so corrected input can be retried.
- Fixture/tests: `packages/contracts/__tests__/kakao-auth-contract.test.mjs` and `apps/api/src/routes/__tests__/kakao-auth.test.ts`.
- Migration/rollback: no database migration; remove the endpoint, pending map, and schemas to roll back.
- Runtime smoke: focused contract/API tests, then workspace lint/test. Evidence is command output in the coding-agent report.
- Reviewers: contract final reviewer and Product/Planning review remain required before push/deploy.
- Non-goals/human gates: persistent production sessions, production identity proof, OAuth configuration, deployment, release, or provider-console changes.
- Completion includes `git diff` and `git status --short`.

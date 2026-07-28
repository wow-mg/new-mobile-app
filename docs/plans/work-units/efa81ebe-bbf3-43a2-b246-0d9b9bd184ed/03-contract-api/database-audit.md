# Room 986 PickleHub Database and Hardcoding Audit

## Sources compared

- Accepted PickleHub MVP DB expectation: `docs/plans/work-units/f1270dcf-4cd1-4a45-a8bf-c03978906abe/03-contract-api/database-schema.md`.
- Implemented Drizzle model/migrations: `apps/api/src/db/schema.ts`, `apps/api/drizzle/0001_volatile_adam_destine.sql`, `apps/api/drizzle/0002_striped_selene.sql`, and `apps/api/drizzle/meta/0002_snapshot.json`.
- Shared response/domain contracts: `packages/contracts/src/index.ts`.
- Runtime persistence/mapping: `apps/api/src/services/participant-mvp.service.ts`, `apps/api/src/db/migrate.ts`, and `apps/api/src/index.ts`.
- Mobile client boundary: `apps/mobile/src/participant/api-client.ts`.

## DB integration and hardcoding findings

- DB integration is present. API startup runs programmatic Drizzle migrations (`apps/api/src/index.ts:6`, `apps/api/src/db/migrate.ts:6-8`). Outside Vitest/test mode, participant profile, tournament application, support, notification, payment, and tournament catalog paths use Drizzle selects/inserts/updates in `apps/api/src/services/participant-mvp.service.ts`.
- Explicit sandbox hardcoding remains in `apps/api/src/services/participant-mvp.service.ts`: sandbox participant id/profile, tournament/division/application/payment/support/notification fixtures and fixed timestamps/amounts. Test mode intentionally uses the in-memory versions; non-test dev also idempotently seeds these fixtures into Postgres. This matches the accepted MVP schema document's runtime behavior and dev/sandbox scope, but it is not production/customer data integration.
- Mobile fallback/mock state remains in `apps/mobile/src/participant/mock-session.ts` and fallback branches in `apps/mobile/src/app/index.tsx`. The real client exists in `apps/mobile/src/participant/api-client.ts` and is enabled only when public API configuration is supplied.
- Security residual risk (not changed here): `apps/mobile/src/participant/api-client.ts` accepts `EXPO_PUBLIC_PARTICIPANT_API_BEARER_TOKEN`. Any `EXPO_PUBLIC_*` value is client-visible under repo policy, so this must never carry a secret. This slice does not inspect values or redesign auth; Backend/API Integrator/security ownership is required before real user/production integration.
- Destructive helper risk (not invoked): `resetParticipantMvpState()` deletes application/profile rows outside test mode at `apps/api/src/services/participant-mvp.service.ts:104-112`. No reset/delete was run for this work or deployment.

## PRD/schema gap comparison

- Member expectation: the accepted PickleHub DB SoT specifies `participant_profiles`, not a standalone `members` table. The dirty Kakao dev auth contract has a member-shaped response, but no accepted persistence SoT authorizes a `members` table or migration. Result: unknown/future auth persistence requirement; no table invented.
- Tournament application: all accepted columns exist in Drizzle and migrations: `application_id`, `tournament_id`, optional `division_id`, `participant_id`, optional `partner_invitation_id`, `dupr_id`, `status`, `submitted_at`, `support_channel`, `payment_status`, and `refund_policy`. `partner_invitation_id` is persisted operator metadata and is not currently returned by the mobile contract.
- Payment: all accepted columns exist in Drizzle and migrations: `payment_record_id`, `application_id`, `participant_id`, `amount_krw`, `payment_mode`, `status`, optional `operator_note`, `recorded_at`, and `updated_at`. `updated_at` is persisted operator metadata and is not currently returned by the mobile contract.
- Migration state: migrations `0001` and `0002`, journal, and snapshot cover the accepted tables/columns. No source-backed missing table/column/migration was found.

## Schema action

No schema or migration change was created. Adding a standalone member/auth persistence model or exposing DB-only metadata would invent scope beyond the accepted PRD and requires a separate Backend/API Integrator contract/PII/auth decision. No destructive or manual migration command was run.

## Rollback and smoke

- Schema rollback: not applicable because no schema changed.
- Runtime deploy smoke: API `/livez` and `/readyz` only after all validation and final reviews; this does not prove real payment or OAuth account flows.

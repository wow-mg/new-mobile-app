# Tournament Draft/Approval Contract/API PR 1 Plan

- Work unit / Workboard card: `5b8380fc-d6b0-4759-a94b-4b4b5c99dc90`
- Owner: Backend/API Integrator
- Artifact stage: `03-contract-api`
- Consuming flows: organizer tournament-draft authoring/submission; admin tournament review and publication
- Evidence: `.evidence/room986-tournament-draft-api-202607310851/`
- Routing: `.evidence/room986-tournament-draft-api-202607310851/codex-role-routing.json` (`ready`)

## Source of Truth inputs

- `AGENTS.md`: tests first; contracts are the shared API SoT; routes → services → db; additive non-interactive Drizzle migrations; branch/PR gates.
- `PROJECT_ENVIRONMENT.md`: Hono/Drizzle/Postgres/Zod API runtime, contracts build/test commands, current auth/runtime constraints.
- `.agents/skills/wm/SKILL.md`: plan, checkpoint, evidence, and read-only review gates.
- `.agents/skills/mobile-backend-api-integrator-workflow/{SKILL.md,references/sot.md}`: Backend/API ownership and required API Contract Plan Packet.
- `.evidence/room986-tournament-draft-api-202607310851/{codex-prompt.md,codex-role-routing.json}`: approved PR 1 scope, role separation, required states/reviewers, closed external gates.
- `docs/plans/work-units/pool-ko-tournament/00-product-planning/pool-ko-design-packet.md` and `packages/contracts/src/pool-ko.ts`: approved POOL+KO division config/status shape.
- `apps/api/src/{app.ts,db/schema.ts,routes/admin-operator.ts,services/admin-operator.service.ts,services/participant-mvp.service.ts}`: current route, dev/staging operator auth, persistence, field-mapping, and Gwangnaru catalog behavior.

## Contract plan packet

Shared schemas will be defined only in `packages/contracts`, with TypeScript API
fields in camelCase and database columns in snake_case:

- `tournamentDraftStatusSchema`: `draft`, `submitted`, `inReview`,
  `changesRequested`, `rejected`, `approved`, `published`.
- `tournamentDraftDivisionInputSchema`: existing materialized division fields
  plus the existing `poolKoDivisionSchema` configuration shape with
  `format: POOL_KO`.
- `tournamentDraftSchema`, list/detail response schemas, and audit event schema.
- Organizer create/update request schemas; submit response uses the shared draft
  response.
- Admin request-changes/reject reason schemas and start-review/approve/publish
  responses using the shared draft response.
- `tournamentDraftApiErrorResponseSchema` with typed not-found, forbidden,
  invalid-transition, immutable, validation, and dev/staging-only codes.

Endpoints:

| Role | Method and path | Request | Response |
| --- | --- | --- | --- |
| Organizer | `POST /api/organizer/tournament-drafts` | create schema | draft |
| Organizer | `GET /api/organizer/tournament-drafts` | none | owner-bounded list |
| Organizer | `GET /api/organizer/tournament-drafts/:draftId` | none | owner-bounded draft |
| Organizer | `PATCH /api/organizer/tournament-drafts/:draftId` | update schema | draft |
| Organizer | `POST /api/organizer/tournament-drafts/:draftId/submit` | none | `submitted` draft |
| Admin | `GET /api/admin/tournaments/drafts` | optional status query | list |
| Admin | `GET /api/admin/tournaments/drafts/:draftId` | none | draft |
| Admin | `POST /api/admin/tournaments/drafts/:draftId/start-review` | none | `inReview` draft |
| Admin | `POST /api/admin/tournaments/drafts/:draftId/request-changes` | reason | `changesRequested` draft |
| Admin | `POST /api/admin/tournaments/drafts/:draftId/reject` | reason | `rejected` draft |
| Admin | `POST /api/admin/tournaments/drafts/:draftId/approve` | none | `approved` draft |
| Admin | `POST /api/admin/tournaments/drafts/:draftId/publish` | none | `published` draft |

Organizer writes are owner-bounded. Because no real organizer session is present
in the verified runtime, organizer routes will use a test/dev-staging-only bearer
identity and fail closed outside that mode. Admin routes retain the existing
operator bearer gate. No request is automatically retried; clients may retry
safe reads, while mutations return typed errors and publication is guarded by
state and transaction semantics.

Persistence is additive: `tournament_drafts`,
`tournament_draft_divisions`, and `tournament_draft_events`. Rollback is removal
of those new objects before consumer adoption. Publication is the only operation
that creates/updates existing `tournaments` and `tournament_divisions`, and only
an `approved` draft can publish. Static Gwangnaru catalog entries remain
unchanged and receive an explicit four-item regression assertion.

No separate mobile mock fixture is added: API route tests provide the stable
contract examples for the downstream mobile flow, and no mobile consumer is
changed in this PR.

## Tests-first checkpoints

1. Contract checkpoint: add failing contract assertions, implement schemas,
   run contracts build/test, and obtain a bounded `wm-contract-reviewer` review.
2. Persistence checkpoint: add failing schema/migration assertions, implement
   Drizzle schema and generated additive migration, run focused checks, and
   obtain a contract checkpoint review if persistence risk changed.
3. API checkpoint: add failing organizer/admin transition, ownership, auth,
   error, and materialization tests; implement services/routes; run focused API
   tests/lint; obtain bounded checkpoint reviews.
4. Final checkpoint: run the Gwangnaru four-catalog regression, all requested
   commands, `git diff --check`, and both final required reviewers against the
   approved plan, diff, outputs, and evidence.

Each checkpoint prompt will include this plan, checkpoint diff, command output,
evidence path, and remaining-plan impact. A non-GO finding is fixed and
re-reviewed before proceeding.

## Gates, risks, and non-goals

- Plan and final reviewers: `wm-contract-reviewer` and
  `wm-implementation-reviewer`.
- Runtime smoke: contracts build/test, focused API tests, API lint, and
  `git diff --check`; service evidence is stored in the run evidence directory.
- Migration is generated non-interactively and is not applied to any live DB.
- Residual risk: production identity/session integration is deferred; the local
  organizer identity must remain explicitly dev/staging-only and fail closed.
- Human/external gates remain closed: no UI, dependency change, live database or
  provider call, provider console, deploy, release, push, PR, merge, or secrets.
- Completion requires reviewer evidence, changed paths, command results,
  residual risks, `git diff --stat`, and full `git status --short`.

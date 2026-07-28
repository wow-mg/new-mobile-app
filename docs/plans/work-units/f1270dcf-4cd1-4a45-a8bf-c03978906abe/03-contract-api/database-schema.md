# PickleHub MVP Database Schema

## Scope

This document describes the additive PickleHub MVP tables created for the participant tournament flow. The schema supports sandbox tournament discovery, DUPR-gated applications, partner invitation tracking, support inquiry routing, operator-managed offline payment records, and participant notifications.

Runtime migrations are generated with Drizzle and are applied by the API runtime `runMigrations()` path. This work does not manually apply migrations or perform destructive database actions.

## Tables

### `tournaments`

Purpose: source-of-truth catalog for MVP tournament cards and detail pages.

Key columns:
- `tournament_id` primary key, stable API id.
- `title`, `division`, `location`, `starts_at`, public catalog display fields.
- `application_status`, currently expected to be `available` for MVP.
- `requires_dupr`, MVP application gate flag.
- `payment_mode`, currently `operatorManagedOffline`.
- `cancellation_policy`, currently `operatorSupportOnly`.
- `created_at`, `updated_at`, operator/audit timestamps.

Relationships:
- Referenced by id from `tournament_divisions`, `tournament_applications`, and `partner_invitations`.

### `tournament_divisions`

Purpose: MVP division/fee metadata for tournament registration surfaces.

Key columns:
- `division_id` primary key.
- `tournament_id`, parent tournament id.
- `name`, `skill_level`, `team_type`, division display and matching metadata.
- `entry_fee_krw`, offline/operator-managed fee amount.
- `capacity_teams`, optional operator capacity planning value.
- `created_at`, `updated_at`.

Relationships:
- Belongs to `tournaments` by `tournament_id`.
- May be referenced by `tournament_applications` and `partner_invitations` through `division_id`.

### `participant_profiles`

Purpose: participant identity and DUPR readiness state for the MVP application gate.

Key columns:
- `participant_id` primary key.
- `display_name`.
- `dupr_id`, optional self-reported DUPR value.
- `dupr_status`, currently `missing` or `selfReportedPendingOperatorReview`.
- `support_channel`, currently `oneToOneInquiry`.
- `updated_at`.

Relationships:
- Referenced by id from `tournament_applications`, `partner_invitations`, `support_inquiries`, `payment_records`, and `notifications`.

### `tournament_applications`

Purpose: submitted participant tournament application record.

Key columns:
- `application_id` primary key.
- `tournament_id`, target tournament id.
- `division_id`, optional division id for the selected event.
- `participant_id`, submitting participant id.
- `partner_invitation_id`, optional partner invitation record id.
- `dupr_id`, DUPR value captured at submission.
- `status`, currently `submitted`.
- `submitted_at`.
- `support_channel`, `payment_status`, `refund_policy`, policy/status literals returned by the MVP API.

Relationships:
- Belongs to `tournaments` by `tournament_id`.
- Belongs to `participant_profiles` by `participant_id`.
- Optionally links to `tournament_divisions` and `partner_invitations`.
- Referenced by `support_inquiries`, `payment_records`, and `notifications` when context is application-specific.

### `partner_invitations`

Purpose: track doubles partner invitation state without implementing messaging delivery in the MVP.

Key columns:
- `invitation_id` primary key.
- `tournament_id`, `division_id`, application context.
- `application_id`, optional application link.
- `inviter_participant_id`.
- `invitee_contact`, operator-visible invitee contact handle or masked phone/email value.
- `status`, for example pending/accepted/expired in future flows.
- `expires_at`, `created_at`, `updated_at`.

Relationships:
- Belongs to tournament/division/application by id columns.
- Inviter belongs to `participant_profiles` by `inviter_participant_id`.

### `support_inquiries`

Purpose: record MVP support/refund/cancellation inquiries for operator handling.

Key columns:
- `inquiry_id` primary key.
- `participant_id`, optional participant context.
- `application_id`, optional application context.
- `channel`, currently expected to map to `oneToOneInquiry`.
- `category`, `subject`, `status`.
- `created_at`, `updated_at`.

Relationships:
- Optionally belongs to `participant_profiles` and `tournament_applications` by id.

### `payment_records`

Purpose: operator/offline payment tracking only. This is not payment gateway storage.

Key columns:
- `payment_record_id` primary key.
- `application_id`, `participant_id`.
- `amount_krw`.
- `payment_mode`, currently expected to be `operatorManagedOffline`.
- `status`, operator-managed payment state.
- `operator_note`, optional internal note.
- `recorded_at`, `updated_at`.

Relationships:
- Belongs to `tournament_applications` and `participant_profiles` by id.

### `notifications`

Purpose: participant-facing MVP notification center data.

Key columns:
- `notification_id` primary key.
- `participant_id`.
- `type`, `title`, `body`.
- `related_application_id`, optional application context.
- `read_at`, nullable read marker.
- `created_at`.

Relationships:
- Belongs to `participant_profiles` by `participant_id`.
- Optionally references `tournament_applications` by `related_application_id`.

## Runtime behavior

- The API keeps Vitest isolated from external Postgres with the existing in-memory test store.
- Outside test mode, tournament catalog reads now use the `tournaments` table.
- If the tournament table is empty, the API seeds the existing sandbox tournament catalog through an idempotent insert, then reads it back from DB.
- Existing `participant_profiles` and `tournament_applications` behavior is preserved.

## Non-goals and limits

- No payment gateway integration, card data, PG transaction identifiers, or settlement workflow.
- No destructive migration, data reset, truncate, or manual DB migration execution.
- No push, deployment, PR, release, or production-readiness claim.
- No foreign-key constraints were added in this migration; relationships are represented by explicit id columns to match the current Drizzle setup.
- Partner invitation delivery, notification delivery, and support ticket workflow automation remain future work.

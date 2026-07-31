import { pgTable, bigserial, boolean, integer, jsonb, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const members = pgTable('members', {
  memberId: text('member_id').primaryKey(),
  email: text('email'),
  phone: text('phone'),
  displayName: text('display_name').notNull(),
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('members_email_unique').on(table.email), uniqueIndex('members_phone_unique').on(table.phone)]);

export const socialIdentities = pgTable('social_identities', {
  socialIdentityId: text('social_identity_id').primaryKey(),
  memberId: text('member_id').notNull().references(() => members.memberId),
  provider: text('provider').notNull(),
  providerUserId: text('provider_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('social_identities_provider_user_unique').on(table.provider, table.providerUserId)]);

export const counterEvents = pgTable('counter_events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  count: integer('count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournaments = pgTable('tournaments', {
  tournamentId: text('tournament_id').primaryKey(),
  title: text('title').notNull(),
  division: text('division').notNull(),
  location: text('location').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  applicationStatus: text('application_status').notNull(),
  requiresDupr: boolean('requires_dupr').notNull().default(true),
  paymentMode: text('payment_mode').notNull(),
  cancellationPolicy: text('cancellation_policy').notNull(),
  fullRefundCutoffHours: integer('full_refund_cutoff_hours'),
  partialRefundCutoffHours: integer('partial_refund_cutoff_hours'),
  partialRefundPercent: integer('partial_refund_percent'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournamentDivisions = pgTable('tournament_divisions', {
  divisionId: text('division_id').primaryKey(),
  tournamentId: text('tournament_id').notNull(),
  name: text('name').notNull(),
  skillLevel: text('skill_level'),
  teamType: text('team_type').notNull(),
  entryFeeKrw: integer('entry_fee_krw').notNull(),
  capacityTeams: integer('capacity_teams'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournamentDrafts = pgTable('tournament_drafts', {
  draftId: text('draft_id').primaryKey(),
  organizerId: text('organizer_id').notNull(),
  status: text('status').notNull(),
  title: text('title').notNull(),
  location: text('location').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  applicationStatus: text('application_status').notNull(),
  requiresDupr: boolean('requires_dupr').notNull().default(true),
  paymentMode: text('payment_mode').notNull(),
  cancellationPolicy: text('cancellation_policy').notNull(),
  fullRefundCutoffHours: integer('full_refund_cutoff_hours'),
  partialRefundCutoffHours: integer('partial_refund_cutoff_hours'),
  partialRefundPercent: integer('partial_refund_percent'),
  reviewReason: text('review_reason'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedTournamentId: text('published_tournament_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournamentDraftDivisions = pgTable('tournament_draft_divisions', {
  draftDivisionId: text('draft_division_id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => tournamentDrafts.draftId, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  name: text('name').notNull(),
  skillLevel: text('skill_level'),
  teamType: text('team_type').notNull(),
  entryFeeKrw: integer('entry_fee_krw').notNull(),
  capacityTeams: integer('capacity_teams'),
  poolKoConfig: jsonb('pool_ko_config').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournamentDraftEvents = pgTable('tournament_draft_events', {
  eventId: text('event_id').primaryKey(),
  draftId: text('draft_id').notNull().references(() => tournamentDrafts.draftId, { onDelete: 'cascade' }),
  actorId: text('actor_id').notNull(),
  actorRole: text('actor_role').notNull(),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  reason: text('reason'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export const participantProfiles = pgTable('participant_profiles', {
  participantId: text('participant_id').primaryKey(),
  displayName: text('display_name').notNull(),
  duprId: text('dupr_id'),
  duprStatus: text('dupr_status').notNull(),
  supportChannel: text('support_channel').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tournamentApplications = pgTable('tournament_applications', {
  applicationId: text('application_id').primaryKey(),
  tournamentId: text('tournament_id').notNull(),
  divisionId: text('division_id'),
  participantId: text('participant_id').notNull(),
  partnerInvitationId: text('partner_invitation_id'),
  duprId: text('dupr_id').notNull(),
  status: text('status').notNull(),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull(),
  supportChannel: text('support_channel').notNull(),
  paymentStatus: text('payment_status').notNull(),
  refundPolicy: text('refund_policy').notNull(),
});

export const partnerInvitations = pgTable('partner_invitations', {
  invitationId: text('invitation_id').primaryKey(),
  tournamentId: text('tournament_id').notNull(),
  divisionId: text('division_id'),
  applicationId: text('application_id'),
  inviterParticipantId: text('inviter_participant_id').notNull(),
  inviteeContact: text('invitee_contact').notNull(),
  status: text('status').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const supportInquiries = pgTable('support_inquiries', {
  inquiryId: text('inquiry_id').primaryKey(),
  participantId: text('participant_id'),
  applicationId: text('application_id'),
  channel: text('channel').notNull(),
  category: text('category').notNull(),
  subject: text('subject').notNull(),
  status: text('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const paymentRecords = pgTable('payment_records', {
  paymentRecordId: text('payment_record_id').primaryKey(),
  applicationId: text('application_id').notNull(),
  participantId: text('participant_id').notNull(),
  amountKrw: integer('amount_krw').notNull(),
  paymentMode: text('payment_mode').notNull(),
  status: text('status').notNull(),
  providerPaymentId: text('provider_payment_id'),
  providerOrderId: text('provider_order_id'),
  providerStatus: text('provider_status'),
  amount: integer('amount'),
  currency: text('currency'),
  idempotencyKey: text('idempotency_key'),
  providerAuditMetadata: jsonb('provider_audit_metadata'),
  providerRawResponseMetadata: jsonb('provider_raw_response_metadata'),
  providerCreatedAt: timestamp('provider_created_at', { withTimezone: true }),
  reconciledAt: timestamp('reconciled_at', { withTimezone: true }),
  operatorNote: text('operator_note'),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('payment_records_idempotency_key_unique').on(table.idempotencyKey)]);

export const paymentProviderEvents = pgTable('payment_provider_events', {
  paymentProviderEventAuditId: text('payment_provider_event_audit_id').primaryKey(),
  provider: text('provider').notNull(),
  providerEventId: text('provider_event_id'),
  eventHashVersion: text('event_hash_version').notNull(),
  eventHash: text('event_hash').notNull(),
  paymentRecordId: text('payment_record_id'),
  applicationId: text('application_id').notNull(),
  providerPaymentId: text('provider_payment_id').notNull(),
  providerOrderId: text('provider_order_id').notNull(),
  providerStatus: text('provider_status').notNull(),
  amount: integer('amount').notNull(),
  currency: text('currency').notNull(),
  verificationResult: text('verification_result').notNull(),
  processingResult: text('processing_result').notNull(),
  rejectionCode: text('rejection_code'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('payment_provider_events_provider_event_unique')
    .on(table.provider, table.providerEventId),
  uniqueIndex('payment_provider_events_provider_hash_unique')
    .on(table.provider, table.eventHashVersion, table.eventHash),
]);

export const paymentNotificationHandoffs = pgTable('payment_notification_handoffs', {
  paymentNotificationHandoffId: text('payment_notification_handoff_id').primaryKey(),
  paymentProviderEventAuditId: text('payment_provider_event_audit_id').notNull().references(
    () => paymentProviderEvents.paymentProviderEventAuditId,
    { onDelete: 'restrict' },
  ),
  idempotencyKey: text('idempotency_key').notNull(),
  paymentRecordId: text('payment_record_id').notNull(),
  applicationId: text('application_id').notNull(),
  participantId: text('participant_id').notNull(),
  status: text('status').notNull(),
  deliveryStatus: text('delivery_status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('payment_notification_handoffs_event_unique')
    .on(table.paymentProviderEventAuditId),
  uniqueIndex('payment_notification_handoffs_idempotency_unique')
    .on(table.idempotencyKey),
]);

export const refundRequests = pgTable('refund_requests', {
  refundRequestId: text('refund_request_id').primaryKey(),
  paymentRecordId: text('payment_record_id').notNull().references(
    () => paymentRecords.paymentRecordId,
    { onDelete: 'restrict' },
  ),
  applicationId: text('application_id').notNull().references(
    () => tournamentApplications.applicationId,
    { onDelete: 'restrict' },
  ),
  participantId: text('participant_id').notNull().references(
    () => participantProfiles.participantId,
    { onDelete: 'restrict' },
  ),
  status: text('status').notNull(),
  policyDecision: text('policy_decision').notNull(),
  policySnapshot: jsonb('policy_snapshot').notNull(),
  paidAmountKrw: integer('paid_amount_krw').notNull(),
  requestedAmountKrw: integer('requested_amount_krw').notNull(),
  approvedAmountKrw: integer('approved_amount_krw'),
  currency: text('currency').notNull(),
  reason: text('reason').notNull(),
  operatorReason: text('operator_reason'),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('refund_requests_payment_record_unique').on(table.paymentRecordId),
]);

export const refundTransactions = pgTable('refund_transactions', {
  refundTransactionId: text('refund_transaction_id').primaryKey(),
  refundRequestId: text('refund_request_id').notNull().references(
    () => refundRequests.refundRequestId,
    { onDelete: 'restrict' },
  ),
  idempotencyKey: text('idempotency_key').notNull(),
  providerKind: text('provider_kind').notNull(),
  status: text('status').notNull(),
  amountKrw: integer('amount_krw').notNull(),
  currency: text('currency').notNull(),
  providerReference: text('provider_reference'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, (table) => [
  uniqueIndex('refund_transactions_request_idempotency_unique')
    .on(table.refundRequestId, table.idempotencyKey),
]);

export const refundHistory = pgTable('refund_history', {
  refundHistoryId: text('refund_history_id').primaryKey(),
  refundRequestId: text('refund_request_id').notNull().references(
    () => refundRequests.refundRequestId,
    { onDelete: 'restrict' },
  ),
  event: text('event').notNull(),
  actorKind: text('actor_kind').notNull(),
  refundStatus: text('refund_status').notNull(),
  applicationStatus: text('application_status').notNull(),
  paymentStatus: text('payment_status').notNull(),
  amountKrw: integer('amount_krw'),
  currency: text('currency'),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const notifications = pgTable('notifications', {
  notificationId: text('notification_id').primaryKey(),
  participantId: text('participant_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  relatedApplicationId: text('related_application_id'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

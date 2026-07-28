import { z } from 'zod';

export const COUNTER_INCREMENT = 1;

export const counterEventSchema = z.object({
  count: z.number().int().nonnegative(),
});
export type CounterEvent = z.infer<typeof counterEventSchema>;

export const counterEventRequestSchema = counterEventSchema;

export const counterEventRecordSchema = counterEventSchema.extend({
  id: z.number().int().positive(),
  createdAt: z.string(),
});
export type CounterEventRecord = z.infer<typeof counterEventRecordSchema>;

export const supportChannelSchema = z.literal('oneToOneInquiry');

export const participantProfileSchema = z.object({
  participantId: z.string().min(1),
  displayName: z.string().min(1),
  duprId: z.string().min(1).optional(),
  duprStatus: z.enum(['missing', 'selfReportedPendingOperatorReview']),
  supportChannel: supportChannelSchema,
});
export type ParticipantProfile = z.infer<typeof participantProfileSchema>;

export const updateParticipantProfileRequestSchema = z.object({
  duprId: z.string().trim().min(1),
});
export type UpdateParticipantProfileRequest = z.infer<typeof updateParticipantProfileRequestSchema>;

export const tournamentSchema = z.object({
  tournamentId: z.string().min(1),
  title: z.string().min(1),
  division: z.string().min(1),
  location: z.string().min(1),
  startsAt: z.string(),
  applicationStatus: z.literal('available'),
  requiresDupr: z.literal(true),
  paymentMode: z.literal('operatorManagedOffline'),
  cancellationPolicy: z.literal('operatorSupportOnly'),
});
export type Tournament = z.infer<typeof tournamentSchema>;

export const tournamentDivisionSchema = z.object({
  divisionId: z.string().min(1),
  tournamentId: z.string().min(1),
  name: z.string().min(1),
  skillLevel: z.string().min(1).optional(),
  teamType: z.string().min(1),
  entryFeeKrw: z.number().int().nonnegative(),
  capacityTeams: z.number().int().positive().optional(),
});
export type TournamentDivision = z.infer<typeof tournamentDivisionSchema>;

export const tournamentDetailSchema = tournamentSchema.extend({
  divisions: z.array(tournamentDivisionSchema),
});
export type TournamentDetail = z.infer<typeof tournamentDetailSchema>;

export const tournamentListResponseSchema = z.object({
  tournaments: z.array(tournamentSchema),
});
export type TournamentListResponse = z.infer<typeof tournamentListResponseSchema>;

export const tournamentApplicationStatusSchema = z.enum([
  'submitted',
  'cancellationRequested',
  'cancellationApproved',
  'cancelled',
]);
export type TournamentApplicationStatus = z.infer<typeof tournamentApplicationStatusSchema>;

export const participantApiErrorCodeSchema = z.enum([
  'DUPR_PROFILE_REQUIRED',
  'PARTICIPANT_SELF_CANCEL_DISABLED',
  'TOURNAMENT_NOT_FOUND',
  'APPLICATION_NOT_FOUND',
]);
export type ParticipantApiErrorCode = z.infer<typeof participantApiErrorCodeSchema>;

export const participantApplicationErrorCodeSchema = participantApiErrorCodeSchema;
export type ParticipantApplicationErrorCode = ParticipantApiErrorCode;

export const participantApiHttpErrorCodeSchema = z.string().regex(/^PARTICIPANT_API_HTTP_\d{3}$/);
export type ParticipantApiHttpErrorCode = z.infer<typeof participantApiHttpErrorCodeSchema>;

export const participantApiErrorResponseSchema = z.object({
  error: participantApiErrorCodeSchema,
});
export type ParticipantApiErrorResponse = z.infer<typeof participantApiErrorResponseSchema>;

export const tournamentApplicationSchema = z.object({
  applicationId: z.string().min(1),
  tournamentId: z.string().min(1),
  participantId: z.string().min(1),
  duprId: z.string().min(1),
  divisionId: z.string().min(1).optional(),
  status: tournamentApplicationStatusSchema,
  submittedAt: z.string(),
  supportChannel: supportChannelSchema,
  paymentStatus: z.literal('notStartedSandbox'),
  refundPolicy: z.literal('participantSelfCancelDisabled'),
});
export type TournamentApplication = z.infer<typeof tournamentApplicationSchema>;

export const createTournamentApplicationRequestSchema = z.object({
  tournamentId: z.string().min(1),
  participantId: z.string().min(1).optional(),
  duprId: z.string().trim().min(1).optional(),
  divisionId: z.string().min(1).optional(),
});
export type CreateTournamentApplicationRequest = z.infer<typeof createTournamentApplicationRequestSchema>;


export const supportInquirySchema = z.object({
  inquiryId: z.string().min(1),
  participantId: z.string().min(1).optional(),
  applicationId: z.string().min(1).optional(),
  channel: supportChannelSchema,
  category: z.string().min(1),
  subject: z.string().min(1),
  status: z.enum(['open', 'operatorReview', 'closed']),
  createdAt: z.string(),
});
export type SupportInquiry = z.infer<typeof supportInquirySchema>;

export const supportCenterResponseSchema = z.object({
  policyCopy: z.string().min(1),
  contactEmail: z.string().email(),
  operatingHours: z.string().min(1),
  inquiries: z.array(supportInquirySchema),
});
export type SupportCenterResponse = z.infer<typeof supportCenterResponseSchema>;

export const createSupportInquiryRequestSchema = z.object({
  category: z.string().trim().min(1),
  subject: z.string().trim().min(1),
  applicationId: z.string().trim().min(1).optional(),
});
export type CreateSupportInquiryRequest = z.infer<typeof createSupportInquiryRequestSchema>;

export const participantNotificationSchema = z.object({
  notificationId: z.string().min(1),
  participantId: z.string().min(1),
  type: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  relatedApplicationId: z.string().min(1).optional(),
  readAt: z.string().optional(),
  createdAt: z.string(),
});
export type ParticipantNotification = z.infer<typeof participantNotificationSchema>;

export const notificationListResponseSchema = z.object({
  notifications: z.array(participantNotificationSchema),
});
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>;

export const paymentModeSchema = z.enum(['operatorManagedOffline', 'card', 'simplePay']);
export type PaymentMode = z.infer<typeof paymentModeSchema>;

export const paymentStatusSchema = z.enum([
  'notStartedSandbox',
  'operatorReview',
  'confirmedOffline',
  'orderCreated',
  'pendingProvider',
  'paid',
  'failed',
  'cancelled',
  'refundRequested',
  'refundApproved',
  'refundRejected',
  'refundPendingProvider',
  'refunded',
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentProviderStatusSchema = z.enum([
  'created',
  'pending',
  'paid',
  'failed',
  'cancelled',
  'refunded',
]);
export type PaymentProviderStatus = z.infer<typeof paymentProviderStatusSchema>;

export const createPaymentOrderRequestSchema = z.object({
  applicationId: z.string().trim().min(1),
  paymentMode: z.enum(['card', 'simplePay']),
  amount: z.number().int().positive(),
  currency: z.literal('KRW'),
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();
export type CreatePaymentOrderRequest = z.infer<typeof createPaymentOrderRequestSchema>;

export const reconcilePaymentRequestSchema = z.object({
  applicationId: z.string().trim().min(1),
  amount: z.number().int().positive(),
  currency: z.literal('KRW'),
}).strict();
export type ReconcilePaymentRequest = z.infer<typeof reconcilePaymentRequestSchema>;

export const paymentOrderResponseSchema = z.object({
  paymentRecordId: z.string().min(1),
  applicationId: z.string().min(1),
  paymentMode: z.enum(['card', 'simplePay']),
  status: z.enum(['orderCreated', 'pendingProvider', 'paid', 'failed', 'cancelled', 'refunded']),
  providerPaymentId: z.string().min(1).optional(),
  providerOrderId: z.string().min(1).optional(),
  providerStatus: paymentProviderStatusSchema.optional(),
  amount: z.number().int().positive(),
  currency: z.literal('KRW'),
  createdAt: z.string(),
  updatedAt: z.string(),
  reconciledAt: z.string().optional(),
}).strict();
export type PaymentOrderResponse = z.infer<typeof paymentOrderResponseSchema>;

export const paymentApiErrorCodeSchema = z.enum([
  'PAYMENT_APPLICATION_NOT_FOUND',
  'PAYMENT_APPLICATION_OWNERSHIP_MISMATCH',
  'PAYMENT_RECORD_NOT_FOUND',
  'PAYMENT_AMOUNT_MISMATCH',
  'PAYMENT_IDEMPOTENCY_CONFLICT',
  'PAYMENT_INVALID_TRANSITION',
  'PAYMENT_PROVIDER_UNAVAILABLE',
  'PAYMENT_SANDBOX_ONLY',
  'PAYMENT_FORBIDDEN',
  'REFUND_POLICY_UNAVAILABLE',
  'REFUND_INVALID_TRANSITION',
  'REFUND_REQUEST_NOT_FOUND',
]);
export type PaymentApiErrorCode = z.infer<typeof paymentApiErrorCodeSchema>;

export const paymentApiErrorResponseSchema = z.object({
  error: paymentApiErrorCodeSchema,
}).strict();
export type PaymentApiErrorResponse = z.infer<typeof paymentApiErrorResponseSchema>;

export const paymentProviderWebhookEventSchema = z.object({
  provider: z.literal('kg_inicis'),
  providerEventId: z.string().trim().min(1).max(160).optional(),
  providerPaymentId: z.string().trim().min(1).max(160),
  providerOrderId: z.string().trim().min(1).max(160),
  applicationId: z.string().trim().min(1).max(160),
  amount: z.number().int().positive(),
  currency: z.literal('KRW'),
  providerStatus: paymentProviderStatusSchema,
  occurredAt: z.string().datetime(),
}).strict();
export type PaymentProviderWebhookEvent = z.infer<typeof paymentProviderWebhookEventSchema>;

export const paymentWebhookProcessingResultSchema = z.enum([
  'processed',
  'duplicate',
  'ignoredOutOfOrder',
]);
export type PaymentWebhookProcessingResult = z.infer<typeof paymentWebhookProcessingResultSchema>;

export const paymentProviderWebhookResponseSchema = z.object({
  accepted: z.literal(true),
  result: paymentWebhookProcessingResultSchema,
  paymentRecordId: z.string().min(1),
  status: z.enum(['orderCreated', 'pendingProvider', 'paid', 'failed', 'cancelled', 'refunded']),
}).strict();
export type PaymentProviderWebhookResponse = z.infer<typeof paymentProviderWebhookResponseSchema>;

export const paymentProviderWebhookErrorCodeSchema = z.enum([
  'PAYMENT_WEBHOOK_SIGNATURE_REQUIRED',
  'PAYMENT_WEBHOOK_SIGNATURE_INVALID',
  'PAYMENT_WEBHOOK_EVENT_INVALID',
  'PAYMENT_WEBHOOK_PAYMENT_NOT_FOUND',
  'PAYMENT_WEBHOOK_REFERENCE_MISMATCH',
  'PAYMENT_WEBHOOK_AMOUNT_MISMATCH',
  'PAYMENT_WEBHOOK_PERSISTENCE_FAILED',
]);
export type PaymentProviderWebhookErrorCode = z.infer<typeof paymentProviderWebhookErrorCodeSchema>;

export const paymentProviderWebhookErrorResponseSchema = z.object({
  error: paymentProviderWebhookErrorCodeSchema,
}).strict();
export type PaymentProviderWebhookErrorResponse = z.infer<typeof paymentProviderWebhookErrorResponseSchema>;

export const refundPolicyDecisionSchema = z.enum([
  'fullRefund',
  'partialRefund',
  'noRefund',
  'operatorOverride',
]);
export type RefundPolicyDecision = z.infer<typeof refundPolicyDecisionSchema>;

export const refundRequestStatusSchema = z.enum([
  'operatorReview',
  'approved',
  'rejected',
  'providerPending',
  'refunded',
  'providerFailed',
]);
export type RefundRequestStatus = z.infer<typeof refundRequestStatusSchema>;

export const refundHistoryEventSchema = z.enum([
  'requested',
  'approved',
  'rejected',
  'providerRequested',
  'providerSucceeded',
  'providerFailed',
]);
export const refundActorKindSchema = z.enum(['customer', 'operator', 'sandboxProvider']);

export const refundHistoryEntrySchema = z.object({
  refundHistoryId: z.string().min(1),
  event: refundHistoryEventSchema,
  actorKind: refundActorKindSchema,
  refundStatus: refundRequestStatusSchema,
  applicationStatus: tournamentApplicationStatusSchema,
  paymentStatus: paymentStatusSchema,
  amountKrw: z.number().int().nonnegative().optional(),
  currency: z.literal('KRW').optional(),
  message: z.string().min(1).max(300),
  createdAt: z.string().datetime(),
}).strict();
export type RefundHistoryEntry = z.infer<typeof refundHistoryEntrySchema>;

export const refundRequestSchema = z.object({
  refundRequestId: z.string().min(1),
  paymentRecordId: z.string().min(1),
  applicationId: z.string().min(1),
  status: refundRequestStatusSchema,
  policyDecision: refundPolicyDecisionSchema,
  applicationStatus: tournamentApplicationStatusSchema,
  paymentStatus: paymentStatusSchema,
  paidAmountKrw: z.number().int().nonnegative(),
  requestedAmountKrw: z.number().int().nonnegative(),
  approvedAmountKrw: z.number().int().nonnegative().optional(),
  currency: z.literal('KRW'),
  reason: z.string().min(1).max(500),
  requestedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  history: z.array(refundHistoryEntrySchema),
}).strict();
export type RefundRequest = z.infer<typeof refundRequestSchema>;

export const refundTransactionSchema = z.object({
  refundTransactionId: z.string().min(1),
  refundRequestId: z.string().min(1),
  providerKind: z.literal('sandboxMock'),
  status: z.enum(['mockPending', 'mockSucceeded', 'mockFailed']),
  amountKrw: z.number().int().nonnegative(),
  currency: z.literal('KRW'),
  providerReference: z.string().min(1).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
}).strict();
export type RefundTransaction = z.infer<typeof refundTransactionSchema>;

export const createRefundRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
}).strict();
export type CreateRefundRequest = z.infer<typeof createRefundRequestSchema>;

export const approveRefundRequestSchema = z.object({
  override: z.object({
    decision: z.literal('operatorOverride'),
    amountKrw: z.number().int().nonnegative(),
    reason: z.string().trim().min(1).max(500),
  }).strict().optional(),
}).strict();
export type ApproveRefundRequest = z.infer<typeof approveRefundRequestSchema>;

export const rejectRefundRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
}).strict();
export type RejectRefundRequest = z.infer<typeof rejectRefundRequestSchema>;

export const requestProviderRefundSchema = z.object({
  idempotencyKey: z.string().trim().min(8).max(128).regex(/^[A-Za-z0-9._:-]+$/),
}).strict();
export type RequestProviderRefund = z.infer<typeof requestProviderRefundSchema>;

export const refundHistoryResponseSchema = z.object({
  refundRequest: refundRequestSchema,
}).strict();
export type RefundHistoryResponse = z.infer<typeof refundHistoryResponseSchema>;

export const adminRefundRequestResponseSchema = z.object({
  refundRequest: refundRequestSchema,
  latestTransaction: refundTransactionSchema.optional(),
}).strict();
export type AdminRefundRequestResponse = z.infer<typeof adminRefundRequestResponseSchema>;

export const paymentRecordSchema = z.object({
  paymentRecordId: z.string().min(1),
  applicationId: z.string().min(1),
  participantId: z.string().min(1),
  amountKrw: z.number().int().nonnegative(),
  paymentMode: paymentModeSchema,
  status: paymentStatusSchema,
  providerPaymentId: z.string().min(1).optional(),
  providerOrderId: z.string().min(1).optional(),
  providerStatus: paymentProviderStatusSchema.optional(),
  amount: z.number().int().positive().optional(),
  currency: z.literal('KRW').optional(),
  operatorNote: z.string().min(1).optional(),
  recordedAt: z.string(),
});
export type PaymentRecord = z.infer<typeof paymentRecordSchema>;

export const myPageResponseSchema = z.object({
  profile: participantProfileSchema,
  applications: z.array(tournamentApplicationSchema),
  paymentRecords: z.array(paymentRecordSchema),
});
export type MyPageResponse = z.infer<typeof myPageResponseSchema>;

export const participantGameSchema = z.object({
  gameId: z.string().min(1),
  applicationId: z.string().min(1),
  tournamentId: z.string().min(1),
  tournamentTitle: z.string().min(1),
  divisionName: z.string().min(1).optional(),
  location: z.string().min(1),
  startsAt: z.string(),
  applicationStatus: tournamentApplicationStatusSchema,
  paymentStatus: paymentRecordSchema.shape.status,
  paymentAmountKrw: z.number().int().nonnegative().optional(),
  supportChannel: supportChannelSchema,
  dataSource: z.enum(['db', 'memoryFallback']),
});
export type ParticipantGame = z.infer<typeof participantGameSchema>;

export const participantGamesResponseSchema = z.object({
  games: z.array(participantGameSchema),
});
export type ParticipantGamesResponse = z.infer<typeof participantGamesResponseSchema>;

export const adminApiErrorCodeSchema = z.enum([
  'ADMIN_API_FORBIDDEN',
  'ADMIN_API_NOT_FOUND',
  'ADMIN_API_INVALID_STATUS',
  'ADMIN_API_DEV_STAGING_ONLY',
  'ADMIN_REFUND_INVALID_TRANSITION',
  'ADMIN_REFUND_OVERRIDE_INVALID',
  'ADMIN_REFUND_PROVIDER_UNAVAILABLE',
]);
export type AdminApiErrorCode = z.infer<typeof adminApiErrorCodeSchema>;

export const adminApiErrorResponseSchema = z.object({
  error: adminApiErrorCodeSchema,
});
export type AdminApiErrorResponse = z.infer<typeof adminApiErrorResponseSchema>;

export const adminMemberSchema = z.object({
  memberId: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  displayName: z.string().min(1),
  status: z.enum(['active', 'suspended', 'deleted']),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminMember = z.infer<typeof adminMemberSchema>;

export const updateAdminMemberStatusRequestSchema = z.object({
  status: adminMemberSchema.shape.status,
});
export type UpdateAdminMemberStatusRequest = z.infer<typeof updateAdminMemberStatusRequestSchema>;

export const adminMemberListResponseSchema = z.object({ members: z.array(adminMemberSchema) });
export type AdminMemberListResponse = z.infer<typeof adminMemberListResponseSchema>;

export const adminTournamentApplicationSchema = tournamentApplicationSchema.extend({
  auditSafeMemberRef: z.string().min(1),
});
export type AdminTournamentApplication = z.infer<typeof adminTournamentApplicationSchema>;
export const adminTournamentApplicationListResponseSchema = z.object({ applications: z.array(adminTournamentApplicationSchema) });
export type AdminTournamentApplicationListResponse = z.infer<typeof adminTournamentApplicationListResponseSchema>;

export const adminPaymentRecordSchema = paymentRecordSchema.extend({
  refundReviewStatus: z.enum([
    'notRequested',
    'operatorReview',
    'approvedOffline',
    'rejectedOffline',
    'providerPending',
    'providerFailed',
    'refunded',
  ]),
});
export type AdminPaymentRecord = z.infer<typeof adminPaymentRecordSchema>;
export const adminPaymentRecordListResponseSchema = z.object({ paymentRecords: z.array(adminPaymentRecordSchema) });
export type AdminPaymentRecordListResponse = z.infer<typeof adminPaymentRecordListResponseSchema>;

export const updateAdminPaymentStatusRequestSchema = z.object({
  status: paymentRecordSchema.shape.status,
  operatorNote: z.string().trim().min(1).optional(),
});
export type UpdateAdminPaymentStatusRequest = z.infer<typeof updateAdminPaymentStatusRequestSchema>;

export const updateAdminSupportInquiryStatusRequestSchema = z.object({
  status: supportInquirySchema.shape.status,
});
export type UpdateAdminSupportInquiryStatusRequest = z.infer<typeof updateAdminSupportInquiryStatusRequestSchema>;

export const adminSupportInquirySchema = supportInquirySchema.extend({
  auditSafeParticipantRef: z.string().min(1).optional(),
});
export type AdminSupportInquiry = z.infer<typeof adminSupportInquirySchema>;
export const adminSupportInquiryListResponseSchema = z.object({ inquiries: z.array(adminSupportInquirySchema) });
export type AdminSupportInquiryListResponse = z.infer<typeof adminSupportInquiryListResponseSchema>;

export const healthStatusSchema = z.enum(['ok', 'unavailable']);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const livenessResponseSchema = z.object({
  status: z.literal('ok'),
}).strict();
export type LivenessResponse = z.infer<typeof livenessResponseSchema>;

export const readinessResponseSchema = z.object({
  status: healthStatusSchema,
}).strict();
export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

const healthCheckSchema = z.object({
  status: healthStatusSchema,
}).strict();

export const operationalHealthResponseSchema = z.object({
  status: healthStatusSchema,
  checks: z.object({
    process: healthCheckSchema,
    database: healthCheckSchema,
  }).strict(),
}).strict();
export type OperationalHealthResponse = z.infer<typeof operationalHealthResponseSchema>;

export const opsErrorDomainSchema = z.enum([
  'cs',
  'admin',
  'payment',
  'refund',
  'dependency',
  'internal',
]);
export type OpsErrorDomain = z.infer<typeof opsErrorDomainSchema>;

export const opsErrorCodeSchema = z.enum([
  'CS_INQUIRY_NOT_FOUND',
  'ADMIN_ACTION_FORBIDDEN',
  'ADMIN_ACTION_INVALID',
  'PAYMENT_REVIEW_CONFLICT',
  'REFUND_REVIEW_CONFLICT',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
]);
export type OpsErrorCode = z.infer<typeof opsErrorCodeSchema>;

export const opsErrorDescriptorSchema = z.discriminatedUnion('code', [
  z.object({ domain: z.literal('cs'), code: z.literal('CS_INQUIRY_NOT_FOUND'), retryable: z.literal(false) }).strict(),
  z.object({ domain: z.literal('admin'), code: z.literal('ADMIN_ACTION_FORBIDDEN'), retryable: z.literal(false) }).strict(),
  z.object({ domain: z.literal('admin'), code: z.literal('ADMIN_ACTION_INVALID'), retryable: z.literal(false) }).strict(),
  z.object({ domain: z.literal('payment'), code: z.literal('PAYMENT_REVIEW_CONFLICT'), retryable: z.literal(false) }).strict(),
  z.object({ domain: z.literal('refund'), code: z.literal('REFUND_REVIEW_CONFLICT'), retryable: z.literal(false) }).strict(),
  z.object({ domain: z.literal('dependency'), code: z.literal('DEPENDENCY_UNAVAILABLE'), retryable: z.literal(true) }).strict(),
  z.object({ domain: z.literal('internal'), code: z.literal('INTERNAL_ERROR'), retryable: z.literal(true) }).strict(),
]);
export type OpsErrorDescriptor = z.infer<typeof opsErrorDescriptorSchema>;

export const operationalEventSchema = z.object({
  timestamp: z.string().datetime(),
  event: z.enum(['request.completed', 'request.failed']),
  level: z.enum(['info', 'error']),
  outcome: z.enum(['success', 'failure']),
  requestId: z.string().min(1).max(64),
  method: z.string().min(1).max(16),
  route: z.string().min(1).max(160).regex(/^\/[A-Za-z0-9_./:*{}-]*$/),
  statusCode: z.number().int().min(100).max(599),
  durationMs: z.number().int().nonnegative(),
  error: opsErrorDescriptorSchema.optional(),
}).strict();
export type OperationalEvent = z.infer<typeof operationalEventSchema>;

export const adminAuditEventSchema = z.object({
  timestamp: z.string().datetime(),
  event: z.literal('admin.action'),
  level: z.enum(['info', 'error']),
  outcome: z.enum(['success', 'failure']),
  requestId: z.string().min(1).max(64),
  action: z.enum([
    'member.status.update',
    'payment.status.update',
    'support.status.update',
    'refund.approve',
    'refund.reject',
    'refund.provider.request',
  ]),
  actorRef: z.literal('operator:authenticated'),
  subjectRef: z.enum(['member:redacted', 'payment:redacted', 'support:redacted', 'refund:redacted']),
  error: opsErrorDescriptorSchema.optional(),
}).strict();
export type AdminAuditEvent = z.infer<typeof adminAuditEventSchema>;

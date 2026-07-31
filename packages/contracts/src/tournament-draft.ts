import { z } from 'zod';
import { poolKoDivisionSchema } from './pool-ko.js';

const idSchema = z.string().trim().min(1);
const timestampSchema = z.string().datetime();

export const tournamentDraftStatusSchema = z.enum([
  'draft',
  'submitted',
  'inReview',
  'changesRequested',
  'rejected',
  'approved',
  'published',
]);
export type TournamentDraftStatus = z.infer<typeof tournamentDraftStatusSchema>;

export const tournamentDraftPoolKoConfigSchema = poolKoDivisionSchema.pick({
  format: true,
  kPerPool: true,
  poolScoringConfig: true,
  koScoringConfig: true,
  withdrawalRule: true,
  publicDrawPolicy: true,
});
export type TournamentDraftPoolKoConfig = z.infer<typeof tournamentDraftPoolKoConfigSchema>;

export const tournamentDraftDivisionInputSchema = z.object({
  name: z.string().trim().min(1),
  skillLevel: z.string().trim().min(1).optional(),
  teamType: z.string().trim().min(1),
  entryFeeKrw: z.number().int().nonnegative(),
  capacityTeams: z.number().int().positive().optional(),
  poolKoConfig: tournamentDraftPoolKoConfigSchema,
}).strict();
export type TournamentDraftDivisionInput = z.infer<typeof tournamentDraftDivisionInputSchema>;

export const createTournamentDraftRequestSchema = z.object({
  title: z.string().trim().min(1),
  location: z.string().trim().min(1),
  startsAt: timestampSchema,
  applicationStatus: z.literal('available'),
  requiresDupr: z.literal(true),
  paymentMode: z.literal('operatorManagedOffline'),
  cancellationPolicy: z.literal('operatorSupportOnly'),
  fullRefundCutoffHours: z.number().int().nonnegative().optional(),
  partialRefundCutoffHours: z.number().int().nonnegative().optional(),
  partialRefundPercent: z.number().int().min(0).max(100).optional(),
  divisions: z.array(tournamentDraftDivisionInputSchema).min(1),
}).strict();
export type CreateTournamentDraftRequest = z.infer<typeof createTournamentDraftRequestSchema>;

export const updateTournamentDraftRequestSchema = createTournamentDraftRequestSchema.partial()
  .refine((value) => Object.keys(value).length > 0, 'At least one field is required');
export type UpdateTournamentDraftRequest = z.infer<typeof updateTournamentDraftRequestSchema>;

export const tournamentDraftDivisionSchema = tournamentDraftDivisionInputSchema.extend({
  divisionId: idSchema,
}).strict();
export type TournamentDraftDivision = z.infer<typeof tournamentDraftDivisionSchema>;

export const tournamentDraftSchema = createTournamentDraftRequestSchema.omit({ divisions: true }).extend({
  draftId: idSchema,
  organizerId: idSchema,
  status: tournamentDraftStatusSchema,
  divisions: z.array(tournamentDraftDivisionSchema).min(1),
  reviewReason: z.string().trim().min(1).optional(),
  submittedAt: timestampSchema.optional(),
  reviewedAt: timestampSchema.optional(),
  approvedAt: timestampSchema.optional(),
  publishedAt: timestampSchema.optional(),
  publishedTournamentId: idSchema.optional(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
}).strict();
export type TournamentDraft = z.infer<typeof tournamentDraftSchema>;

export const tournamentDraftListResponseSchema = z.object({
  drafts: z.array(tournamentDraftSchema),
}).strict();
export type TournamentDraftListResponse = z.infer<typeof tournamentDraftListResponseSchema>;

export const adminTournamentDraftListQuerySchema = z.object({
  status: tournamentDraftStatusSchema.optional(),
}).strict();
export type AdminTournamentDraftListQuery = z.infer<typeof adminTournamentDraftListQuerySchema>;

export const tournamentDraftReasonRequestSchema = z.object({
  reason: z.string().trim().min(1),
}).strict();
export type TournamentDraftReasonRequest = z.infer<typeof tournamentDraftReasonRequestSchema>;

export const tournamentDraftEventSchema = z.object({
  eventId: idSchema,
  draftId: idSchema,
  actorId: idSchema,
  actorRole: z.enum(['organizer', 'admin']),
  fromStatus: tournamentDraftStatusSchema.optional(),
  toStatus: tournamentDraftStatusSchema,
  reason: z.string().trim().min(1).optional(),
  occurredAt: timestampSchema,
}).strict();
export type TournamentDraftEvent = z.infer<typeof tournamentDraftEventSchema>;

export const tournamentDraftApiErrorCodeSchema = z.enum([
  'TOURNAMENT_DRAFT_NOT_FOUND',
  'TOURNAMENT_DRAFT_FORBIDDEN',
  'TOURNAMENT_DRAFT_INVALID_TRANSITION',
  'TOURNAMENT_DRAFT_IMMUTABLE',
  'TOURNAMENT_DRAFT_VALIDATION_ERROR',
  'TOURNAMENT_DRAFT_DEV_STAGING_ONLY',
]);
export type TournamentDraftApiErrorCode = z.infer<typeof tournamentDraftApiErrorCodeSchema>;

export const tournamentDraftApiErrorResponseSchema = z.object({
  error: tournamentDraftApiErrorCodeSchema,
}).strict();
export type TournamentDraftApiErrorResponse = z.infer<typeof tournamentDraftApiErrorResponseSchema>;

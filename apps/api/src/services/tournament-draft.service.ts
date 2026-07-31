import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq } from 'drizzle-orm';
import {
  tournamentDraftListResponseSchema,
  tournamentDraftSchema,
  type CreateTournamentDraftRequest,
  type TournamentDraft,
  type TournamentDraftApiErrorCode,
  type TournamentDraftDivisionInput,
  type TournamentDraftReasonRequest,
  type TournamentDraftStatus,
  type UpdateTournamentDraftRequest,
} from '@template/contracts';
import { db } from '../db/client.js';
import {
  tournamentDraftDivisions,
  tournamentDraftEvents,
  tournamentDrafts,
  tournamentDivisions,
  tournaments,
} from '../db/schema.js';

const useMemoryStore = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
const memoryDrafts = new Map<string, TournamentDraft>();
const memoryPublishedTournaments = new Map<string, { tournament: typeof tournaments.$inferInsert; divisions: Array<typeof tournamentDivisions.$inferInsert> }>();

export class TournamentDraftError extends Error {
  constructor(
    public readonly code: TournamentDraftApiErrorCode,
    public readonly status: 400 | 403 | 404 | 409,
  ) {
    super(code);
  }
}

export function resetTournamentDraftState() {
  memoryDrafts.clear();
  memoryPublishedTournaments.clear();
}

export function getPublishedTournamentMaterializationForTest(tournamentId: string) {
  return memoryPublishedTournaments.get(tournamentId);
}

export function getPublishedTournamentMaterializationCountForTest() {
  return memoryPublishedTournaments.size;
}

export async function createTournamentDraft(organizerId: string, input: CreateTournamentDraftRequest) {
  const now = new Date();
  const draftId = `draft_${randomUUID()}`;
  const draft = tournamentDraftSchema.parse({
    draftId, organizerId, status: 'draft', ...input,
    divisions: input.divisions.map((division) => ({ divisionId: `draft_division_${randomUUID()}`, ...division })),
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  });
  if (useMemoryStore) {
    memoryDrafts.set(draftId, draft);
    return draft;
  }
  await db.transaction(async (tx) => {
    await tx.insert(tournamentDrafts).values(toDraftInsert(draft));
    await tx.insert(tournamentDraftDivisions).values(draft.divisions.map((division, position) => toDivisionInsert(draftId, division, position)));
    await insertEvent(tx, draftId, organizerId, 'organizer', undefined, 'draft', undefined, now);
  });
  return draft;
}

export async function listOrganizerTournamentDrafts(organizerId: string) {
  const drafts = useMemoryStore
    ? [...memoryDrafts.values()].filter((draft) => draft.organizerId === organizerId)
    : await loadDrafts(eq(tournamentDrafts.organizerId, organizerId));
  return tournamentDraftListResponseSchema.parse({ drafts });
}

export async function getOrganizerTournamentDraft(organizerId: string, draftId: string) {
  const draft = await getAdminTournamentDraft(draftId);
  if (draft.organizerId !== organizerId) throw new TournamentDraftError('TOURNAMENT_DRAFT_FORBIDDEN', 403);
  return draft;
}

export async function updateOrganizerTournamentDraft(organizerId: string, draftId: string, input: UpdateTournamentDraftRequest) {
  const current = await getOrganizerTournamentDraft(organizerId, draftId);
  if (current.status !== 'draft' && current.status !== 'changesRequested') {
    throw new TournamentDraftError('TOURNAMENT_DRAFT_IMMUTABLE', 409);
  }
  const now = new Date();
  const next = tournamentDraftSchema.parse({
    ...current, ...input, status: 'draft', reviewReason: undefined,
    divisions: input.divisions
      ? input.divisions.map((division, index) => ({ divisionId: current.divisions[index]?.divisionId ?? `draft_division_${randomUUID()}`, ...division }))
      : current.divisions,
    updatedAt: now.toISOString(),
  });
  if (useMemoryStore) {
    memoryDrafts.set(draftId, next);
    return next;
  }
  await db.transaction(async (tx) => {
    await tx.update(tournamentDrafts).set(toDraftUpdate(next)).where(eq(tournamentDrafts.draftId, draftId));
    if (input.divisions) {
      await tx.delete(tournamentDraftDivisions).where(eq(tournamentDraftDivisions.draftId, draftId));
      await tx.insert(tournamentDraftDivisions).values(next.divisions.map((division, position) => toDivisionInsert(draftId, division, position)));
    }
    if (current.status === 'changesRequested') await insertEvent(tx, draftId, organizerId, 'organizer', current.status, 'draft', undefined, now);
  });
  return next;
}

export async function submitTournamentDraft(organizerId: string, draftId: string) {
  const current = await getOrganizerTournamentDraft(organizerId, draftId);
  return transition(current, ['draft'], 'submitted', organizerId, 'organizer');
}

export async function listAdminTournamentDrafts(status?: TournamentDraftStatus) {
  const drafts = useMemoryStore
    ? [...memoryDrafts.values()].filter((draft) => !status || draft.status === status)
    : await loadDrafts(status ? eq(tournamentDrafts.status, status) : undefined);
  return tournamentDraftListResponseSchema.parse({ drafts });
}

export async function getAdminTournamentDraft(draftId: string) {
  if (useMemoryStore) {
    const draft = memoryDrafts.get(draftId);
    if (!draft) throw new TournamentDraftError('TOURNAMENT_DRAFT_NOT_FOUND', 404);
    return draft;
  }
  const [draft] = await loadDrafts(eq(tournamentDrafts.draftId, draftId));
  if (!draft) throw new TournamentDraftError('TOURNAMENT_DRAFT_NOT_FOUND', 404);
  return draft;
}

export async function startTournamentDraftReview(draftId: string, adminId: string) {
  return transition(await getAdminTournamentDraft(draftId), ['submitted'], 'inReview', adminId, 'admin');
}
export async function requestTournamentDraftChanges(draftId: string, adminId: string, input: TournamentDraftReasonRequest) {
  return transition(await getAdminTournamentDraft(draftId), ['inReview'], 'changesRequested', adminId, 'admin', input.reason);
}
export async function rejectTournamentDraft(draftId: string, adminId: string, input: TournamentDraftReasonRequest) {
  return transition(await getAdminTournamentDraft(draftId), ['inReview'], 'rejected', adminId, 'admin', input.reason);
}
export async function approveTournamentDraft(draftId: string, adminId: string) {
  return transition(await getAdminTournamentDraft(draftId), ['inReview'], 'approved', adminId, 'admin');
}

export async function publishTournamentDraft(draftId: string, adminId: string) {
  const current = await getAdminTournamentDraft(draftId);
  if (current.status === 'published' && current.publishedTournamentId) return current;
  if (current.status !== 'approved') throw new TournamentDraftError('TOURNAMENT_DRAFT_INVALID_TRANSITION', 409);
  const now = new Date();
  const tournamentId = current.publishedTournamentId ?? `tournament_${randomUUID()}`;
  const next = tournamentDraftSchema.parse({
    ...current, status: 'published', publishedTournamentId: tournamentId,
    publishedAt: now.toISOString(), updatedAt: now.toISOString(),
  });
  if (useMemoryStore) {
    memoryDrafts.set(draftId, next);
    memoryPublishedTournaments.set(tournamentId, {
      tournament: {
        tournamentId, title: current.title,
        division: current.divisions.map(({ name }) => name).join(' · '),
        location: current.location, startsAt: new Date(current.startsAt),
        applicationStatus: current.applicationStatus, requiresDupr: current.requiresDupr,
        paymentMode: current.paymentMode, cancellationPolicy: current.cancellationPolicy,
      },
      divisions: current.divisions.map((division) => ({
        divisionId: `division_${randomUUID()}`, tournamentId, name: division.name,
        skillLevel: division.skillLevel, teamType: division.teamType,
        entryFeeKrw: division.entryFeeKrw, capacityTeams: division.capacityTeams,
      })),
    });
    return next;
  }
  return db.transaction(async (tx) => {
    const transitioned = await tx.update(tournamentDrafts)
      .set(toDraftUpdate(next))
      .where(and(eq(tournamentDrafts.draftId, draftId), eq(tournamentDrafts.status, 'approved')))
      .returning({ draftId: tournamentDrafts.draftId });
    if (transitioned.length === 0) {
      const [row] = await tx.select().from(tournamentDrafts).where(eq(tournamentDrafts.draftId, draftId));
      if (!row) throw new TournamentDraftError('TOURNAMENT_DRAFT_NOT_FOUND', 404);
      const divisions = await tx.select().from(tournamentDraftDivisions)
        .where(eq(tournamentDraftDivisions.draftId, draftId)).orderBy(asc(tournamentDraftDivisions.position));
      const reloaded = parseDraft(row, divisions);
      if (reloaded.status === 'published' && reloaded.publishedTournamentId) return reloaded;
      throw new TournamentDraftError('TOURNAMENT_DRAFT_INVALID_TRANSITION', 409);
    }
    await tx.insert(tournaments).values({
      tournamentId, title: current.title,
      division: current.divisions.map(({ name }) => name).join(' · '),
      location: current.location, startsAt: new Date(current.startsAt),
      applicationStatus: current.applicationStatus, requiresDupr: current.requiresDupr,
      paymentMode: current.paymentMode, cancellationPolicy: current.cancellationPolicy,
      fullRefundCutoffHours: current.fullRefundCutoffHours,
      partialRefundCutoffHours: current.partialRefundCutoffHours,
      partialRefundPercent: current.partialRefundPercent,
    });
    await tx.insert(tournamentDivisions).values(current.divisions.map((division) => ({
      divisionId: `division_${randomUUID()}`, tournamentId, name: division.name,
      skillLevel: division.skillLevel, teamType: division.teamType,
      entryFeeKrw: division.entryFeeKrw, capacityTeams: division.capacityTeams,
    })));
    await insertEvent(tx, draftId, adminId, 'admin', 'approved', 'published', undefined, now);
    return next;
  });
}

async function transition(current: TournamentDraft, allowed: TournamentDraftStatus[], status: TournamentDraftStatus, actorId: string, actorRole: 'organizer' | 'admin', reason?: string) {
  if (!allowed.includes(current.status)) throw new TournamentDraftError('TOURNAMENT_DRAFT_INVALID_TRANSITION', 409);
  const now = new Date();
  const next = tournamentDraftSchema.parse({
    ...current, status, reviewReason: reason,
    ...(status === 'submitted' ? { submittedAt: now.toISOString() } : {}),
    ...(status === 'inReview' || status === 'changesRequested' || status === 'rejected' ? { reviewedAt: now.toISOString() } : {}),
    ...(status === 'approved' ? { approvedAt: now.toISOString() } : {}),
    updatedAt: now.toISOString(),
  });
  if (useMemoryStore) memoryDrafts.set(current.draftId, next);
  else await db.transaction(async (tx) => {
    await tx.update(tournamentDrafts).set(toDraftUpdate(next)).where(eq(tournamentDrafts.draftId, current.draftId));
    await insertEvent(tx, current.draftId, actorId, actorRole, current.status, status, reason, now);
  });
  return next;
}

async function loadDrafts(where?: ReturnType<typeof eq>): Promise<TournamentDraft[]> {
  const rows = where
    ? await db.select().from(tournamentDrafts).where(where).orderBy(desc(tournamentDrafts.createdAt))
    : await db.select().from(tournamentDrafts).orderBy(desc(tournamentDrafts.createdAt));
  const result: TournamentDraft[] = [];
  for (const row of rows) {
    const divisions = await db.select().from(tournamentDraftDivisions)
      .where(eq(tournamentDraftDivisions.draftId, row.draftId)).orderBy(asc(tournamentDraftDivisions.position));
    result.push(parseDraft(row, divisions));
  }
  return result;
}

function parseDraft(row: typeof tournamentDrafts.$inferSelect, divisions: Array<typeof tournamentDraftDivisions.$inferSelect>) {
  return tournamentDraftSchema.parse({
    draftId: row.draftId, organizerId: row.organizerId, status: row.status,
    title: row.title, location: row.location, startsAt: row.startsAt.toISOString(),
    applicationStatus: row.applicationStatus, requiresDupr: row.requiresDupr,
    paymentMode: row.paymentMode, cancellationPolicy: row.cancellationPolicy,
    fullRefundCutoffHours: row.fullRefundCutoffHours ?? undefined,
    partialRefundCutoffHours: row.partialRefundCutoffHours ?? undefined,
    partialRefundPercent: row.partialRefundPercent ?? undefined,
    reviewReason: row.reviewReason ?? undefined, submittedAt: row.submittedAt?.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString(), approvedAt: row.approvedAt?.toISOString(),
    publishedAt: row.publishedAt?.toISOString(), publishedTournamentId: row.publishedTournamentId ?? undefined,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    divisions: divisions.map((division) => ({
      divisionId: division.draftDivisionId, name: division.name,
      skillLevel: division.skillLevel ?? undefined, teamType: division.teamType,
      entryFeeKrw: division.entryFeeKrw, capacityTeams: division.capacityTeams ?? undefined,
      poolKoConfig: division.poolKoConfig,
    })),
  });
}

function toDraftInsert(draft: TournamentDraft) {
  return { draftId: draft.draftId, organizerId: draft.organizerId, ...toDraftUpdate(draft), createdAt: new Date(draft.createdAt) };
}
function toDraftUpdate(draft: TournamentDraft) {
  return {
    status: draft.status, title: draft.title, location: draft.location, startsAt: new Date(draft.startsAt),
    applicationStatus: draft.applicationStatus, requiresDupr: draft.requiresDupr,
    paymentMode: draft.paymentMode, cancellationPolicy: draft.cancellationPolicy,
    fullRefundCutoffHours: draft.fullRefundCutoffHours, partialRefundCutoffHours: draft.partialRefundCutoffHours,
    partialRefundPercent: draft.partialRefundPercent, reviewReason: draft.reviewReason,
    submittedAt: draft.submittedAt ? new Date(draft.submittedAt) : undefined,
    reviewedAt: draft.reviewedAt ? new Date(draft.reviewedAt) : undefined,
    approvedAt: draft.approvedAt ? new Date(draft.approvedAt) : undefined,
    publishedAt: draft.publishedAt ? new Date(draft.publishedAt) : undefined,
    publishedTournamentId: draft.publishedTournamentId, updatedAt: new Date(draft.updatedAt),
  };
}
function toDivisionInsert(draftId: string, division: TournamentDraftDivisionInput & { divisionId: string }, position: number) {
  return {
    draftDivisionId: division.divisionId, draftId, position, name: division.name,
    skillLevel: division.skillLevel, teamType: division.teamType, entryFeeKrw: division.entryFeeKrw,
    capacityTeams: division.capacityTeams, poolKoConfig: division.poolKoConfig,
  };
}
async function insertEvent(tx: any, draftId: string, actorId: string, actorRole: 'organizer' | 'admin', fromStatus: TournamentDraftStatus | undefined, toStatus: TournamentDraftStatus, reason: string | undefined, occurredAt: Date) {
  await tx.insert(tournamentDraftEvents).values({
    eventId: `draft_event_${randomUUID()}`, draftId, actorId, actorRole, fromStatus, toStatus, reason, occurredAt,
  });
}

import { beforeEach, describe, expect, it } from 'vitest';
import { tournamentDraftApiErrorResponseSchema, tournamentDraftListResponseSchema, tournamentDraftSchema } from '@template/contracts';
import { app } from '../../app.js';
import {
  getPublishedTournamentMaterializationCountForTest,
  getPublishedTournamentMaterializationForTest,
  resetTournamentDraftState,
} from '../../services/tournament-draft.service.js';

const organizerHeaders = { authorization: 'Bearer organizer-test', 'content-type': 'application/json' };
const adminHeaders = { authorization: 'Bearer operator-test', 'content-type': 'application/json' };
const otherOrganizerHeaders = { authorization: 'Bearer organizer-other-test', 'content-type': 'application/json' };
const input = {
  title: 'Autumn Open', location: 'Riverside courts', startsAt: '2026-10-10T09:00:00.000Z',
  applicationStatus: 'available', requiresDupr: true, paymentMode: 'operatorManagedOffline',
  cancellationPolicy: 'operatorSupportOnly',
  divisions: [{
    name: 'Mixed 3.5', skillLevel: '3.5', teamType: 'mixedDoubles', entryFeeKrw: 60000, capacityTeams: 16,
    poolKoConfig: {
      format: 'POOL_KO', kPerPool: { value: 2, source: 'default' },
      poolScoringConfig: { bestOfGames: 1, gamesToWin: 1, pointsToWin: 15, winBy: 2 },
      koScoringConfig: { bestOfGames: 3, gamesToWin: 2, pointsToWin: 11, winBy: 2 },
      withdrawalRule: 'preserve_played_default_remaining', publicDrawPolicy: 'explicit_audited_resolution',
    },
  }],
};

async function json(path: string, headers: Record<string, string>, init: RequestInit = {}) {
  const res = await app.request(path, { ...init, headers: { ...headers, ...init.headers } });
  return { res, body: await res.json() };
}

describe('tournament draft organizer/admin APIs', () => {
  beforeEach(() => resetTournamentDraftState());

  it('keeps organizer reads and writes owner-bounded', async () => {
    const created = await json('/api/organizer/tournament-drafts', organizerHeaders, { method: 'POST', body: JSON.stringify(input) });
    expect(created.res.status).toBe(201);
    const draft = tournamentDraftSchema.parse(created.body);
    expect(tournamentDraftListResponseSchema.parse((await json('/api/organizer/tournament-drafts', organizerHeaders)).body).drafts).toHaveLength(1);
    const other = await json(`/api/organizer/tournament-drafts/${draft.draftId}`, otherOrganizerHeaders);
    expect(other.res.status).toBe(403);
    expect(tournamentDraftApiErrorResponseSchema.parse(other.body).error).toBe('TOURNAMENT_DRAFT_FORBIDDEN');
  });

  it('enforces review transitions and publishes only after approval', async () => {
    const draft = tournamentDraftSchema.parse((await json('/api/organizer/tournament-drafts', organizerHeaders, { method: 'POST', body: JSON.stringify(input) })).body);
    expect((await json(`/api/admin/tournaments/drafts/${draft.draftId}/publish`, adminHeaders, { method: 'POST' })).res.status).toBe(409);
    expect(tournamentDraftSchema.parse((await json(`/api/organizer/tournament-drafts/${draft.draftId}/submit`, organizerHeaders, { method: 'POST' })).body).status).toBe('submitted');
    expect(tournamentDraftSchema.parse((await json(`/api/admin/tournaments/drafts/${draft.draftId}/start-review`, adminHeaders, { method: 'POST' })).body).status).toBe('inReview');
    expect(tournamentDraftSchema.parse((await json(`/api/admin/tournaments/drafts/${draft.draftId}/request-changes`, adminHeaders, { method: 'POST', body: JSON.stringify({ reason: 'Add court allocation' }) })).body).status).toBe('changesRequested');
    expect(tournamentDraftSchema.parse((await json(`/api/organizer/tournament-drafts/${draft.draftId}`, organizerHeaders, { method: 'PATCH', body: JSON.stringify({ location: 'Updated riverside courts' }) })).body).status).toBe('draft');
    await json(`/api/organizer/tournament-drafts/${draft.draftId}/submit`, organizerHeaders, { method: 'POST' });
    await json(`/api/admin/tournaments/drafts/${draft.draftId}/start-review`, adminHeaders, { method: 'POST' });
    const approved = tournamentDraftSchema.parse((await json(`/api/admin/tournaments/drafts/${draft.draftId}/approve`, adminHeaders, { method: 'POST' })).body);
    expect(approved).toMatchObject({ status: 'approved' });
    expect(approved).not.toHaveProperty('publishedTournamentId');
    const published = tournamentDraftSchema.parse((await json(`/api/admin/tournaments/drafts/${draft.draftId}/publish`, adminHeaders, { method: 'POST' })).body);
    expect(published).toMatchObject({ status: 'published', publishedTournamentId: expect.any(String) });
    expect(getPublishedTournamentMaterializationForTest(published.publishedTournamentId!)).toMatchObject({
      tournament: { tournamentId: published.publishedTournamentId },
      divisions: [{ name: 'Mixed 3.5' }],
    });
    const publishedAgain = await json(`/api/admin/tournaments/drafts/${draft.draftId}/publish`, adminHeaders, { method: 'POST' });
    expect(publishedAgain.res.status).toBe(200);
    expect(tournamentDraftSchema.parse(publishedAgain.body)).toMatchObject({
      status: 'published',
      publishedTournamentId: published.publishedTournamentId,
    });
    expect(getPublishedTournamentMaterializationCountForTest()).toBe(1);
  });

  it('supports an explicit admin rejection terminal state', async () => {
    const draft = tournamentDraftSchema.parse((await json('/api/organizer/tournament-drafts', organizerHeaders, { method: 'POST', body: JSON.stringify(input) })).body);
    await json(`/api/organizer/tournament-drafts/${draft.draftId}/submit`, organizerHeaders, { method: 'POST' });
    await json(`/api/admin/tournaments/drafts/${draft.draftId}/start-review`, adminHeaders, { method: 'POST' });
    const rejected = await json(`/api/admin/tournaments/drafts/${draft.draftId}/reject`, adminHeaders, {
      method: 'POST', body: JSON.stringify({ reason: 'Venue unavailable' }),
    });
    expect(tournamentDraftSchema.parse(rejected.body)).toMatchObject({ status: 'rejected', reviewReason: 'Venue unavailable' });
  });

  it('requires role-specific bearer identities', async () => {
    expect((await app.request('/api/organizer/tournament-drafts', { headers: adminHeaders })).status).toBe(403);
    expect((await app.request('/api/admin/tournaments/drafts', { headers: organizerHeaders })).status).toBe(401);
  });
});

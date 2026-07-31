import { describe, expect, it } from 'vitest';
import { tournamentDraftDivisions, tournamentDraftEvents, tournamentDrafts } from '../schema.js';

describe('tournament draft additive schema', () => {
  it('maps camelCase fields to snake_case draft/review tables', () => {
    expect(tournamentDrafts.draftId.name).toBe('draft_id');
    expect(tournamentDrafts.publishedTournamentId.name).toBe('published_tournament_id');
    expect(tournamentDraftDivisions.poolKoConfig.name).toBe('pool_ko_config');
    expect(tournamentDraftEvents.fromStatus.name).toBe('from_status');
  });
});

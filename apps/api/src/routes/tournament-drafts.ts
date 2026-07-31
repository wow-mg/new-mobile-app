import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { zValidator } from '@hono/zod-validator';
import {
  adminTournamentDraftListQuerySchema,
  createTournamentDraftRequestSchema,
  tournamentDraftApiErrorResponseSchema,
  tournamentDraftReasonRequestSchema,
  updateTournamentDraftRequestSchema,
  type TournamentDraftApiErrorCode,
} from '@template/contracts';
import {
  approveTournamentDraft,
  createTournamentDraft,
  getAdminTournamentDraft,
  getOrganizerTournamentDraft,
  listAdminTournamentDrafts,
  listOrganizerTournamentDrafts,
  publishTournamentDraft,
  rejectTournamentDraft,
  requestTournamentDraftChanges,
  startTournamentDraftReview,
  submitTournamentDraft,
  TournamentDraftError,
  updateOrganizerTournamentDraft,
} from '../services/tournament-draft.service.js';
import { Env } from '../env.js';

const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
const organizerIdentities = isTest
  ? new Map([['organizer-test', 'organizer_sandbox_001'], ['organizer-other-test', 'organizer_sandbox_002']])
  : new Map<string, string>();
const operatorTokens = [Env.OPERATOR_BEARER_TOKEN, isTest ? 'operator-test' : undefined]
  .filter((token): token is string => Boolean(token));
const adminAuth = operatorTokens.length
  ? bearerAuth({ token: operatorTokens })
  : async (c: any) => c.json(errorBody('TOURNAMENT_DRAFT_DEV_STAGING_ONLY'), 403);

function errorBody(error: TournamentDraftApiErrorCode) {
  return tournamentDraftApiErrorResponseSchema.parse({ error });
}
function organizerId(authorization?: string) {
  const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  return token ? organizerIdentities.get(token) : undefined;
}
function mapError(error: unknown) {
  if (error instanceof TournamentDraftError) return { body: errorBody(error.code), status: error.status };
  throw error;
}
function invalidJson(result: { success: boolean }, c: any) {
  if (!result.success) return c.json(errorBody('TOURNAMENT_DRAFT_VALIDATION_ERROR'), 400);
}
async function handle(c: any, action: () => Promise<unknown>, successStatus = 200) {
  try {
    return c.json(await action(), successStatus);
  } catch (error) {
    const mapped = mapError(error);
    return c.json(mapped.body, mapped.status);
  }
}

export const organizerTournamentDraftRoute = new Hono()
  .use('*', async (c, next) => {
    const identity = organizerId(c.req.header('authorization'));
    if (!identity) return c.json(errorBody(organizerIdentities.size ? 'TOURNAMENT_DRAFT_FORBIDDEN' : 'TOURNAMENT_DRAFT_DEV_STAGING_ONLY'), 403);
    await next();
  })
  .post('/', zValidator('json', createTournamentDraftRequestSchema, invalidJson), (c) =>
    handle(c, () => createTournamentDraft(organizerId(c.req.header('authorization'))!, c.req.valid('json')), 201))
  .get('/', (c) => handle(c, () => listOrganizerTournamentDrafts(organizerId(c.req.header('authorization'))!)))
  .get('/:draftId', (c) => handle(c, () => getOrganizerTournamentDraft(organizerId(c.req.header('authorization'))!, c.req.param('draftId'))))
  .patch('/:draftId', zValidator('json', updateTournamentDraftRequestSchema, invalidJson), (c) =>
    handle(c, () => updateOrganizerTournamentDraft(organizerId(c.req.header('authorization'))!, c.req.param('draftId'), c.req.valid('json'))))
  .post('/:draftId/submit', (c) =>
    handle(c, () => submitTournamentDraft(organizerId(c.req.header('authorization'))!, c.req.param('draftId'))));

export const adminTournamentDraftRoute = new Hono()
  .use('*', adminAuth)
  .get('/drafts', zValidator('query', adminTournamentDraftListQuerySchema, invalidJson), (c) =>
    handle(c, () => listAdminTournamentDrafts(c.req.valid('query').status)))
  .get('/drafts/:draftId', (c) => handle(c, () => getAdminTournamentDraft(c.req.param('draftId'))))
  .post('/drafts/:draftId/start-review', (c) =>
    handle(c, () => startTournamentDraftReview(c.req.param('draftId'), 'admin_operator')))
  .post('/drafts/:draftId/request-changes', zValidator('json', tournamentDraftReasonRequestSchema, invalidJson), (c) =>
    handle(c, () => requestTournamentDraftChanges(c.req.param('draftId'), 'admin_operator', c.req.valid('json'))))
  .post('/drafts/:draftId/reject', zValidator('json', tournamentDraftReasonRequestSchema, invalidJson), (c) =>
    handle(c, () => rejectTournamentDraft(c.req.param('draftId'), 'admin_operator', c.req.valid('json'))))
  .post('/drafts/:draftId/approve', (c) =>
    handle(c, () => approveTournamentDraft(c.req.param('draftId'), 'admin_operator')))
  .post('/drafts/:draftId/publish', (c) =>
    handle(c, () => publishTournamentDraft(c.req.param('draftId'), 'admin_operator')));

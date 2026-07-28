import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createSupportInquiryRequestSchema,
  createTournamentApplicationRequestSchema,
  participantApiErrorCodeSchema,
  participantApiErrorResponseSchema,
  updateParticipantProfileRequestSchema,
} from '@template/contracts';
import {
  createTournamentApplication,
  createSupportInquiry,
  getMyPage,
  getParticipantProfile,
  listParticipantGames,
  getSupportCenter,
  getTournament,
  getTournamentApplication,
  listNotifications,
  listTournaments,
  ParticipantMvpError,
  requestParticipantSelfCancel,
  updateParticipantDupr,
} from '../services/participant-mvp.service.js';

function mapParticipantMvpError(error: unknown) {
  if (error instanceof ParticipantMvpError) {
    return { body: participantApiErrorResponseSchema.parse({ error: error.message }), status: error.status };
  }
  throw error;
}

export const tournamentsRoute = new Hono()
  .get('/', async (c) => c.json({ tournaments: await listTournaments() }))
  .get('/:tournamentId', async (c) => {
    try {
      return c.json(await getTournament(c.req.param('tournamentId')));
    } catch (error) {
      const mapped = mapParticipantMvpError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

export const participantProfileRoute = new Hono()
  .get('/', async (c) => c.json(await getParticipantProfile()))
  .patch('/', zValidator('json', updateParticipantProfileRequestSchema), async (c) =>
    c.json(await updateParticipantDupr(c.req.valid('json').duprId)),
  );

export const tournamentApplicationsRoute = new Hono()
  .post('/', zValidator('json', createTournamentApplicationRequestSchema), async (c) => {
    try {
      return c.json(await createTournamentApplication(c.req.valid('json')), 201);
    } catch (error) {
      const mapped = mapParticipantMvpError(error);
      return c.json(mapped.body, mapped.status);
    }
  })
  .get('/:applicationId', async (c) => {
    try {
      return c.json(await getTournamentApplication(c.req.param('applicationId')));
    } catch (error) {
      const mapped = mapParticipantMvpError(error);
      return c.json(mapped.body, mapped.status);
    }
  })
  .delete('/:applicationId', async (c) => {
    try {
      await requestParticipantSelfCancel(c.req.param('applicationId'));
      return c.json(participantApiErrorResponseSchema.parse({
        error: participantApiErrorCodeSchema.enum.PARTICIPANT_SELF_CANCEL_DISABLED,
      }), 400);
    } catch (error) {
      const mapped = mapParticipantMvpError(error);
      return c.json(mapped.body, mapped.status);
    }
  });

export const supportRoute = new Hono()
  .get('/', async (c) => c.json(await getSupportCenter()))
  .post('/inquiries', zValidator('json', createSupportInquiryRequestSchema), async (c) => c.json(await createSupportInquiry(c.req.valid('json')), 201));

export const notificationsRoute = new Hono()
  .get('/', async (c) => c.json(await listNotifications()));

export const myPageRoute = new Hono()
  .get('/', async (c) => c.json(await getMyPage()));

export const gamesRoute = new Hono()
  .get('/', async (c) => c.json(await listParticipantGames()));

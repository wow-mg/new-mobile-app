import { Hono } from 'hono';
import { bearerAuth } from 'hono/bearer-auth';
import { cors } from 'hono/cors';
import { healthRoute } from './routes/health.js';
import { counterEventsRoute } from './routes/counter-events.js';
import { kakaoAuthRoute } from './routes/kakao-auth.js';
import {
  participantProfileRoute,
  supportRoute,
  notificationsRoute,
  myPageRoute,
  gamesRoute,
  tournamentApplicationsRoute,
  tournamentsRoute,
} from './routes/participant-mvp.js';
import { adminOperatorRoute } from './routes/admin-operator.js';
import { operationalRequestLogger } from './routes/ops-readiness.js';
import { paymentsRoute } from './routes/payments.js';
import { paymentProviderWebhookRoute } from './routes/payment-provider-webhook.js';
import { Env } from './env.js';
import { consumeParticipantDevSession } from './services/participant-session.service.js';

const apiBearerTokens = [Env.API_BEARER_TOKEN, Env.PARTICIPANT_PREVIEW_BEARER_TOKEN].filter(
  (token): token is string => Boolean(token),
);
const generalApiBearerAuth = bearerAuth({ token: apiBearerTokens });
const roleScopedPath = /^\/api\/(?:payments(?:\/|$)|admin(?:\/|$))/;
function isParticipantDevSessionRequest(method: string, path: string) {
  if ((method === 'GET' || method === 'PATCH') && path === '/api/participant/profile') return true;
  if (method === 'GET' && path === '/api/participant/mypage') return true;
  if (method === 'POST' && path === '/api/tournament-applications') return true;
  return method === 'GET' && /^\/api\/tournament-applications\/[^/]+$/.test(path);
}

const allowedCorsOrigins = [
  'https://picklehub-mobile-dev-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:8081',
  'http://localhost:19006',
];

export const app = new Hono()
  .use('*', operationalRequestLogger())
  .route('/', healthRoute)                          // /livez, /readyz — 무인증
  .use(
    '/auth/*',
    cors({
      origin: (origin) => (allowedCorsOrigins.includes(origin) ? origin : undefined),
      allowMethods: ['GET', 'POST', 'OPTIONS'],
      allowHeaders: ['content-type'],
      maxAge: 600,
    }),
  )
  .route('/auth', kakaoAuthRoute)                   // /auth/kakao — dev OAuth initiation, no client secret exposure
  .use(
    '/api/*',
    cors({
      origin: (origin) => (allowedCorsOrigins.includes(origin) ? origin : undefined),
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['authorization', 'content-type'],
      maxAge: 600,
    }),
  )
  .use('/api/*', async (c, next) => {
    if (roleScopedPath.test(c.req.path)) {
      await next();
      return;
    }
    if (isParticipantDevSessionRequest(c.req.method, c.req.path)) {
      const auth = consumeParticipantDevSession(c.req.header('authorization'));
      if (auth) {
        (c as unknown as { set: (key: string, value: string) => void })
          .set('participantId', auth.session.participantId);
        await next();
        return;
      }
    }
    return generalApiBearerAuth(c, next);
  })  // participant refunds/admin own role-specific auth; other API routes use the general bearer gate
  .route('/api/counter-events', counterEventsRoute)
  .route('/api/tournaments', tournamentsRoute)
  .route('/api/participant/profile', participantProfileRoute)
  .route('/api/participant/support', supportRoute)
  .route('/api/participant/notifications', notificationsRoute)
  .route('/api/participant/mypage', myPageRoute)
  .route('/api/participant/games', gamesRoute)
  .route('/api/tournament-applications', tournamentApplicationsRoute)
  .route('/api/payments/providers/kg-inicis', paymentProviderWebhookRoute)
  .route('/api/payments', paymentsRoute)
  .route('/api/admin', adminOperatorRoute);

import { randomUUID } from 'node:crypto';

const DEV_SESSION_TTL_MS = 10 * 60 * 1000;
const SANDBOX_PARTICIPANT_ID = 'participant_sandbox_001';

type ParticipantDevSession = {
  memberId: string;
  participantId: string;
  kakaoUserId: string;
  providerAccessToken: string;
  expiresAt: number;
};

const sessions = new Map<string, ParticipantDevSession>();

function cleanup(now = Date.now()) {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= now) sessions.delete(token);
  }
}

export function issueParticipantDevSession(input: {
  memberId: string;
  kakaoUserId: string;
  providerAccessToken: string;
}) {
  cleanup();
  const accessToken = randomUUID();
  sessions.set(accessToken, {
    ...input,
    participantId: SANDBOX_PARTICIPANT_ID,
    expiresAt: Date.now() + DEV_SESSION_TTL_MS,
  });
  return { kind: 'dev-session' as const, accessToken, memberId: input.memberId };
}

export function consumeParticipantDevSession(authorization: string | undefined) {
  cleanup();
  const match = authorization?.match(/^Bearer (.+)$/);
  if (!match) return undefined;
  const session = sessions.get(match[1]);
  return session ? { accessToken: match[1], session } : undefined;
}

export function revokeParticipantDevSession(accessToken: string) {
  sessions.delete(accessToken);
}

export function resetParticipantDevSessions() {
  sessions.clear();
}

export function expireParticipantDevSession(accessToken: string) {
  const session = sessions.get(accessToken);
  if (session) sessions.set(accessToken, { ...session, expiresAt: 0 });
}

export function participantDevSessionCount() {
  cleanup();
  return sessions.size;
}

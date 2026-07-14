import {
  participantApplicationErrorCodeSchema,
  type ParticipantProfile,
  type Tournament as MockTournament,
  type TournamentApplication as MockTournamentApplication,
  type TournamentDivision,
} from '@template/contracts';

export type { ParticipantProfile, MockTournament, MockTournamentApplication };

export type SessionActor = {
  actorId: string;
  role: 'participant' | 'organizer' | 'operator' | 'apiConsumer';
  participantId?: string;
  organizerId?: string;
  scopes: string[];
  sessionId: string;
  issuedAt: string;
};

export type ParticipantShellState = {
  sessionActor: SessionActor;
  profile: ParticipantProfile;
  featuredTournament: MockTournament;
};

export const REQUIRED_DUPR_ERROR = participantApplicationErrorCodeSchema.enum.DUPR_PROFILE_REQUIRED;

export const PARTICIPANT_SELF_CANCEL_REFUND_COPY = '참가자 직접 취소 불가';
export const ONE_TO_ONE_INQUIRY_SUPPORT_COPY = '1:1 문의';
export const SELF_CANCEL_REFUND_OPERATOR_SUPPORT_COPY = '참가자 직접 취소/환불은 1:1 문의로 운영자가 확인합니다.';
export const ONE_TO_ONE_INQUIRY_SUPPORT_DETAIL_COPY = '취소와 환불 문의는 1:1 문의로 접수하며, 카카오톡 또는 이메일은 1:1 문의 접수 수단입니다.';

export const supportRefundPolicyFaqQuestions = [
  '참가비 환불은 언제까지 가능한가요?',
  '복식 파트너가 초대를 수락하지 않으면 어떻게 되나요?',
  '경기 결과에 이의가 있으면 어떻게 하나요?',
  'DUPR 정보는 어디서 확인하나요?',
  '대회 신청을 취소하고 싶어요.',
];

export const sandboxFeaturedTournament: MockTournament = {
  tournamentId: 'tournament_sandbox_001',
  title: 'PickleHub Open',
  division: 'Mixed Doubles 3.5+',
  location: 'PickleHub Center Court',
  startsAt: '2026-08-09T09:00:00.000+09:00',
  applicationStatus: 'available',
  requiresDupr: true,
  paymentMode: 'operatorManagedOffline',
  cancellationPolicy: 'operatorSupportOnly',
};

export const sandboxParticipantSession: ParticipantShellState = {
  sessionActor: {
    actorId: 'actor_sandbox_social_001',
    role: 'participant',
    participantId: 'participant_sandbox_001',
    scopes: ['participant:profile:read', 'participant:profile:update', 'participant:application:create'],
    sessionId: 'session_sandbox_social_001',
    issuedAt: '2026-07-08T00:00:00.000Z',
  },
  profile: {
    participantId: 'participant_sandbox_001',
    displayName: 'PickleHub Player',
    duprStatus: 'missing',
    supportChannel: 'oneToOneInquiry',
  },
  featuredTournament: sandboxFeaturedTournament,
};

export function normalizeDuprId(duprId: string) {
  return duprId.trim().toUpperCase();
}

export function hasRequiredDupr(profile: Pick<ParticipantProfile, 'duprId'>) {
  return Boolean(profile.duprId?.trim());
}

export function saveSandboxDupr(profile: ParticipantProfile, duprId: string): ParticipantProfile {
  return {
    ...profile,
    duprId: normalizeDuprId(duprId),
    duprStatus: 'selfReportedPendingOperatorReview',
  };
}

export function describeApplicationPolicy(application: Pick<MockTournamentApplication, 'refundPolicy' | 'supportChannel'>) {
  const refundCopy = application.refundPolicy === 'participantSelfCancelDisabled'
    ? PARTICIPANT_SELF_CANCEL_REFUND_COPY
    : '환불 정책 확인 필요';
  const supportCopy = application.supportChannel === 'oneToOneInquiry'
    ? ONE_TO_ONE_INQUIRY_SUPPORT_COPY
    : '고객센터 문의';

  return `${refundCopy} · ${supportCopy}`;
}

export function describeSupportRefundPolicyCopy(application: Pick<MockTournamentApplication, 'refundPolicy' | 'supportChannel'>) {
  return [
    supportRefundPolicyFaqQuestions.join(' '),
    `${describeApplicationPolicy(application)}.`,
    SELF_CANCEL_REFUND_OPERATOR_SUPPORT_COPY,
    ONE_TO_ONE_INQUIRY_SUPPORT_DETAIL_COPY,
  ].join(' ');
}

export function submitSandboxTournamentApplication(input: {
  profile: ParticipantProfile;
  tournament: MockTournament;
  division?: TournamentDivision;
  submittedAt?: string;
}): MockTournamentApplication {
  if (!hasRequiredDupr(input.profile)) {
    throw new Error(REQUIRED_DUPR_ERROR);
  }

  return {
    applicationId: `application_${input.tournament.tournamentId}_${input.profile.participantId}`,
    tournamentId: input.tournament.tournamentId,
    participantId: input.profile.participantId,
    duprId: normalizeDuprId(input.profile.duprId ?? ''),
    divisionId: input.division?.divisionId,
    status: 'submitted',
    submittedAt: input.submittedAt ?? '2026-07-08T00:00:00.000Z',
    supportChannel: 'oneToOneInquiry',
    paymentStatus: 'notStartedSandbox',
    refundPolicy: 'participantSelfCancelDisabled',
  };
}

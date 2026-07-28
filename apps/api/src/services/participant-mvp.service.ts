import { desc, eq, sql } from 'drizzle-orm';
import {
  createSupportInquiryRequestSchema,
  myPageResponseSchema,
  notificationListResponseSchema,
  participantGamesResponseSchema,
  participantApiErrorCodeSchema,
  type ParticipantApiErrorCode,
  participantApplicationErrorCodeSchema,
  participantProfileSchema,
  paymentRecordSchema,
  type PaymentRecord,
  type ParticipantProfile,
  supportCenterResponseSchema,
  supportInquirySchema,
  type SupportInquiry,
  type Tournament,
  tournamentDetailSchema,
  tournamentDivisionSchema,
  tournamentApplicationSchema,
  tournamentSchema,
  type TournamentApplication,
} from '@template/contracts';
import { db } from '../db/client.js';
import { notifications, participantProfiles, paymentRecords, supportInquiries, tournamentApplications, tournamentDivisions, tournaments } from '../db/schema.js';

const SANDBOX_PARTICIPANT_ID = 'participant_sandbox_001';
const REQUIRED_DUPR_ERROR = participantApplicationErrorCodeSchema.enum.DUPR_PROFILE_REQUIRED;
const SELF_CANCEL_DISABLED_ERROR = participantApplicationErrorCodeSchema.enum.PARTICIPANT_SELF_CANCEL_DISABLED;
const TOURNAMENT_NOT_FOUND_ERROR = participantApiErrorCodeSchema.enum.TOURNAMENT_NOT_FOUND;
const APPLICATION_NOT_FOUND_ERROR = participantApiErrorCodeSchema.enum.APPLICATION_NOT_FOUND;

export class ParticipantMvpError extends Error {
  constructor(
    message: ParticipantApiErrorCode,
    public readonly status: 400 | 404,
  ) {
    super(message);
  }
}

const sandboxTournaments: Tournament[] = [
  {
    tournamentId: 'tournament_sandbox_001',
    title: '2026 협회장배 전국오픈',
    division: '남자복식 · 혼합복식',
    location: '올림픽공원 SK핸드볼경기장',
    startsAt: '2026-08-09T09:00:00.000+09:00',
    applicationStatus: 'available',
    requiresDupr: true,
    paymentMode: 'operatorManagedOffline',
    cancellationPolicy: 'operatorSupportOnly',
  },
  {
    tournamentId: 'tournament_sandbox_002',
    title: '서울 오픈 클럽 리그',
    division: '여자복식 · 초급자부',
    location: '잠실 실내체육관 보조코트',
    startsAt: '2026-08-16T10:00:00.000+09:00',
    applicationStatus: 'available',
    requiresDupr: true,
    paymentMode: 'operatorManagedOffline',
    cancellationPolicy: 'operatorSupportOnly',
  },
  {
    tournamentId: 'tournament_sandbox_003',
    title: '부산 썸머 피클볼 챌린지',
    division: '오픈부 · 시니어부',
    location: '부산 스포원 실내코트',
    startsAt: '2026-08-23T09:30:00.000+09:00',
    applicationStatus: 'available',
    requiresDupr: true,
    paymentMode: 'operatorManagedOffline',
    cancellationPolicy: 'operatorSupportOnly',
  },
  {
    tournamentId: 'tournament_sandbox_004',
    title: '대전 루키스 데이',
    division: '입문자부 · 혼합복식',
    location: '대전 한밭체육관',
    startsAt: '2026-09-05T11:00:00.000+09:00',
    applicationStatus: 'available',
    requiresDupr: true,
    paymentMode: 'operatorManagedOffline',
    cancellationPolicy: 'operatorSupportOnly',
  },
];

function createInitialProfile(): ParticipantProfile {
  return {
    participantId: SANDBOX_PARTICIPANT_ID,
    displayName: 'PickleHub Player',
    duprStatus: 'missing',
    supportChannel: 'oneToOneInquiry',
  };
}

let memoryProfile: ParticipantProfile = createInitialProfile();
const memoryApplications = new Map<string, TournamentApplication>();
const memorySupportInquiries = new Map<string, ReturnType<typeof supportInquirySchema.parse>>();

const useMemoryStore = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

export async function resetParticipantMvpState() {
  memoryProfile = createInitialProfile();
  memoryApplications.clear();
  memorySupportInquiries.clear();

  if (useMemoryStore) return;

  await db.delete(tournamentApplications);
  await db.delete(participantProfiles);
}

export async function listTournaments() {
  if (useMemoryStore) return sandboxTournaments;

  await seedSandboxTournaments();
  const rows = await db.select().from(tournaments);
  return rows.map(parseTournamentRow).sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

export async function getTournament(tournamentId: string) {
  const catalog = await listTournaments();
  const tournament = catalog.find((item) => item.tournamentId === tournamentId);
  if (!tournament) {
    throw new ParticipantMvpError(TOURNAMENT_NOT_FOUND_ERROR, 404);
  }
  const divisions = await listTournamentDivisions(tournament.tournamentId);
  return tournamentDetailSchema.parse({ ...tournament, divisions });
}

export async function listTournamentDivisions(tournamentId: string) {
  if (useMemoryStore) return sandboxDivisions.filter((division) => division.tournamentId === tournamentId);

  await seedSandboxTournaments();
  const rows = await db.select().from(tournamentDivisions).where(eq(tournamentDivisions.tournamentId, tournamentId));
  return rows.map(parseDivisionRow);
}

export async function getParticipantProfile() {
  if (useMemoryStore) return memoryProfile;

  const [existingProfile] = await db
    .select()
    .from(participantProfiles)
    .where(eq(participantProfiles.participantId, SANDBOX_PARTICIPANT_ID))
    .limit(1);

  const initialProfile = createInitialProfile();

  if (existingProfile) {
    if (existingProfile.displayName !== initialProfile.displayName) {
      const [updatedProfile] = await db
        .update(participantProfiles)
        .set({ displayName: initialProfile.displayName, updatedAt: new Date() })
        .where(eq(participantProfiles.participantId, SANDBOX_PARTICIPANT_ID))
        .returning();
      return parseProfileRow(updatedProfile ?? existingProfile);
    }
    return parseProfileRow(existingProfile);
  }

  await db.insert(participantProfiles).values({
    participantId: initialProfile.participantId,
    displayName: initialProfile.displayName,
    duprId: initialProfile.duprId,
    duprStatus: initialProfile.duprStatus,
    supportChannel: initialProfile.supportChannel,
  });
  return initialProfile;
}

export async function updateParticipantDupr(duprId: string) {
  const currentProfile = await getParticipantProfile();
  const nextProfile: ParticipantProfile = {
    ...currentProfile,
    duprId: normalizeDuprId(duprId),
    duprStatus: 'selfReportedPendingOperatorReview',
  };

  if (useMemoryStore) {
    memoryProfile = nextProfile;
    return memoryProfile;
  }

  const [storedProfile] = await db
    .insert(participantProfiles)
    .values({
      participantId: nextProfile.participantId,
      displayName: nextProfile.displayName,
      duprId: nextProfile.duprId,
      duprStatus: nextProfile.duprStatus,
      supportChannel: nextProfile.supportChannel,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: participantProfiles.participantId,
      set: {
        displayName: nextProfile.displayName,
        duprId: nextProfile.duprId,
        duprStatus: nextProfile.duprStatus,
        supportChannel: nextProfile.supportChannel,
        updatedAt: new Date(),
      },
    })
    .returning();

  return parseProfileRow(storedProfile);
}

export async function createTournamentApplication(input: {
  tournamentId: string;
  participantId?: string;
  duprId?: string;
  divisionId?: string;
  submittedAt?: string;
}) {
  const tournament = await getTournament(input.tournamentId);
  const currentProfile = await getParticipantProfile();
  const participantId = input.participantId ?? currentProfile.participantId;
  const duprId = normalizeDuprId(input.duprId ?? currentProfile.duprId ?? '');
  const divisionId = await resolveApplicationDivisionId(tournament.tournamentId, input.divisionId);

  if (tournament.requiresDupr && !duprId) {
    throw new ParticipantMvpError(REQUIRED_DUPR_ERROR, 400);
  }

  const application: TournamentApplication = {
    applicationId: `application_${tournament.tournamentId}_${participantId}`,
    tournamentId: tournament.tournamentId,
    participantId,
    duprId,
    divisionId,
    status: 'submitted',
    submittedAt: input.submittedAt ?? new Date().toISOString(),
    supportChannel: 'oneToOneInquiry',
    paymentStatus: 'notStartedSandbox',
    refundPolicy: 'participantSelfCancelDisabled',
  };

  if (useMemoryStore) {
    memoryApplications.set(application.applicationId, application);
    return application;
  }

  const [storedApplication] = await db
    .insert(tournamentApplications)
    .values({
      applicationId: application.applicationId,
      tournamentId: application.tournamentId,
      participantId: application.participantId,
      divisionId: application.divisionId,
      duprId: application.duprId,
      status: application.status,
      submittedAt: new Date(application.submittedAt),
      supportChannel: application.supportChannel,
      paymentStatus: application.paymentStatus,
      refundPolicy: application.refundPolicy,
    })
    .onConflictDoUpdate({
      target: tournamentApplications.applicationId,
      set: {
        divisionId: application.divisionId,
        duprId: application.duprId,
        status: application.status,
        submittedAt: new Date(application.submittedAt),
        supportChannel: application.supportChannel,
        paymentStatus: application.paymentStatus,
        refundPolicy: application.refundPolicy,
      },
    })
    .returning();

  return parseApplicationRow(storedApplication);
}

export async function getSupportCenter() {
  const profile = await getParticipantProfile();
  const inquiries = await listSupportInquiries(profile.participantId);
  return supportCenterResponseSchema.parse({
    policyCopy: '참가자 직접 취소는 운영자 확인이 필요합니다. 환불·취소 요청은 1:1 문의로 접수해 주세요. DUPR 정보는 DUPR 앱 또는 공식 프로필에서 확인할 수 있습니다.',
    contactEmail: 'support@happickle.kr',
    operatingHours: '평일 10:00 ~ 18:00 (주말·공휴일 휴무)',
    inquiries,
  });
}

export async function listSupportInquiries(participantId = SANDBOX_PARTICIPANT_ID) {
  if (useMemoryStore) {
    if (memorySupportInquiries.size === 0) seedMemorySupportInquiries();
    return [...memorySupportInquiries.values()].filter((inquiry) => inquiry.participantId === participantId);
  }
  await seedSandboxApplications(participantId);
  await seedSandboxSupportInquiries();
  const [rows, applicationRows] = await Promise.all([
    db.select().from(supportInquiries).where(eq(supportInquiries.participantId, participantId)).orderBy(desc(supportInquiries.createdAt)),
    db.select().from(tournamentApplications).where(eq(tournamentApplications.participantId, participantId)),
  ]);
  const applications = applicationRows.map(parseApplicationRow);
  return rows.map(parseSupportInquiryRow).map((inquiry) => maskSupportInquiryForCustomer(inquiry, applications));
}

export async function createSupportInquiry(input: unknown) {
  const parsed = createSupportInquiryRequestSchema.parse(input);
  const profile = await getParticipantProfile();
  const now = new Date();
  const inquiry = supportInquirySchema.parse({
    inquiryId: `inquiry_${now.getTime()}`,
    participantId: profile.participantId,
    applicationId: parsed.applicationId,
    channel: 'oneToOneInquiry',
    category: parsed.category,
    subject: parsed.subject,
    status: 'open',
    createdAt: now.toISOString(),
  });
  if (useMemoryStore) {
    memorySupportInquiries.set(inquiry.inquiryId, inquiry);
    return inquiry;
  }
  const [stored] = await db.insert(supportInquiries).values({
    inquiryId: inquiry.inquiryId,
    participantId: inquiry.participantId,
    applicationId: inquiry.applicationId,
    channel: inquiry.channel,
    category: inquiry.category,
    subject: inquiry.subject,
    status: inquiry.status,
    createdAt: now,
    updatedAt: now,
  }).returning();
  return parseSupportInquiryRow(stored);
}

export async function listNotifications() {
  const profile = await getParticipantProfile();
  if (useMemoryStore) return notificationListResponseSchema.parse({ notifications: sandboxNotifications(profile.participantId) });
  await seedSandboxApplications(profile.participantId);
  await seedSandboxNotifications(profile.participantId);
  const rows = await db.select().from(notifications).where(eq(notifications.participantId, profile.participantId)).orderBy(desc(notifications.createdAt));
  return notificationListResponseSchema.parse({ notifications: rows.map(parseNotificationRow) });
}

export async function getMyPage() {
  const profile = await getParticipantProfile();
  if (useMemoryStore) {
    return myPageResponseSchema.parse({ profile, applications: [...memoryApplications.values()], paymentRecords: sandboxPaymentRecords(profile.participantId, [...memoryApplications.values()]) });
  }
  await seedSandboxApplications(profile.participantId);
  await seedSandboxPaymentRecords(profile.participantId);
  const [applicationRows, paymentRows] = await Promise.all([
    db.select().from(tournamentApplications).where(eq(tournamentApplications.participantId, profile.participantId)),
    db.select().from(paymentRecords).where(eq(paymentRecords.participantId, profile.participantId)).orderBy(desc(paymentRecords.recordedAt)),
  ]);
  const applications = applicationRows.map(parseApplicationRow);
  return myPageResponseSchema.parse({
    profile,
    applications: applications.map(maskParticipantApplicationForCustomer),
    paymentRecords: paymentRows.map(parsePaymentRecordRow).map((payment) => maskParticipantPaymentForCustomer(payment, applications)),
  });
}


export async function listParticipantGames() {
  const profile = await getParticipantProfile();

  if (useMemoryStore) {
    const applications = [...memoryApplications.values()];
    const payments = sandboxPaymentRecords(profile.participantId, applications);
    return participantGamesResponseSchema.parse({
      games: applications.map((application) => buildParticipantGame({
        application,
        tournament: sandboxTournaments.find((item) => item.tournamentId === application.tournamentId) ?? sandboxTournaments[0],
        divisionName: sandboxDivisions.find((division) => division.divisionId === application.divisionId)?.name,
        payment: payments.find((payment) => payment.applicationId === application.applicationId),
        dataSource: 'memoryFallback',
      })),
    });
  }

  await seedSandboxApplications(profile.participantId);
  await seedSandboxTournaments();
  await seedSandboxPaymentRecords(profile.participantId);

  const [applicationRows, tournamentRows, divisionRows, paymentRows] = await Promise.all([
    db.select().from(tournamentApplications).where(eq(tournamentApplications.participantId, profile.participantId)),
    db.select().from(tournaments),
    db.select().from(tournamentDivisions),
    db.select().from(paymentRecords).where(eq(paymentRecords.participantId, profile.participantId)),
  ]);

  const parsedTournaments = tournamentRows.map(parseTournamentRow);
  const parsedDivisions = divisionRows.map(parseDivisionRow);
  const parsedPayments = paymentRows.map(parsePaymentRecordRow);

  return participantGamesResponseSchema.parse({
    games: applicationRows.map(parseApplicationRow).map((application) => buildParticipantGame({
      application: maskParticipantApplicationForCustomer(application),
      tournament: parsedTournaments.find((item) => item.tournamentId === application.tournamentId),
      divisionName: parsedDivisions.find((division) => division.divisionId === application.divisionId)?.name,
      payment: maskParticipantPaymentForCustomer(parsedPayments.find((payment) => payment.applicationId === application.applicationId), [application]),
      dataSource: 'db',
    })),
  });
}

function customerApplicationId(application: TournamentApplication) {
  return `entry-${application.tournamentId.replace(/^tournament_/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}

function customerPaymentRecordId(payment: PaymentRecord) {
  return `receipt-${payment.paymentRecordId.replace(/^payment_/, '').replace(/^application_/, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}`;
}

function maskParticipantApplicationForCustomer(application: TournamentApplication): TournamentApplication {
  return { ...application, applicationId: customerApplicationId(application) };
}

function maskParticipantPaymentForCustomer(payment: PaymentRecord | undefined, applications: TournamentApplication[]): PaymentRecord | undefined {
  if (!payment) return undefined;
  const application = applications.find((item) => item.applicationId === payment.applicationId);
  return {
    ...payment,
    paymentRecordId: customerPaymentRecordId(payment),
    applicationId: application ? customerApplicationId(application) : payment.applicationId.replace(/[^a-z0-9]+/gi, '-'),
  };
}

function maskSupportInquiryForCustomer(inquiry: SupportInquiry, applications: TournamentApplication[]): SupportInquiry {
  if (!inquiry.applicationId) return inquiry;
  const application = applications.find((item) => item.applicationId === inquiry.applicationId);
  return { ...inquiry, applicationId: application ? customerApplicationId(application) : inquiry.applicationId.replace(/[^a-z0-9]+/gi, '-') };
}

export async function getTournamentApplication(applicationId: string) {
  if (useMemoryStore) {
    const application = memoryApplications.get(applicationId);
    if (!application) throw new ParticipantMvpError(APPLICATION_NOT_FOUND_ERROR, 404);
    return application;
  }

  const [application] = await db
    .select()
    .from(tournamentApplications)
    .where(eq(tournamentApplications.applicationId, applicationId))
    .limit(1);
  if (!application) throw new ParticipantMvpError(APPLICATION_NOT_FOUND_ERROR, 404);
  return parseApplicationRow(application);
}

export async function getPaymentApplicationContext(applicationId: string) {
  const application = await getTournamentApplication(applicationId);
  const division = useMemoryStore
    ? sandboxDivisions.find((item) => item.divisionId === application.divisionId)
    : application.divisionId
      ? parseDivisionRow((await db.select().from(tournamentDivisions).where(eq(tournamentDivisions.divisionId, application.divisionId)).limit(1))[0])
      : undefined;

  if (!division) throw new ParticipantMvpError(APPLICATION_NOT_FOUND_ERROR, 404);
  return {
    applicationId: application.applicationId,
    participantId: application.participantId,
    amount: division.entryFeeKrw,
    currency: 'KRW' as const,
  };
}

export async function requestParticipantSelfCancel(applicationId: string) {
  await getTournamentApplication(applicationId);
  throw new ParticipantMvpError(SELF_CANCEL_DISABLED_ERROR, 400);
}


function buildParticipantGame(input: {
  application: TournamentApplication;
  tournament?: Tournament;
  divisionName?: string;
  payment?: PaymentRecord;
  dataSource: 'db' | 'memoryFallback';
}) {
  const tournament = input.tournament ?? sandboxTournaments[0];
  return {
    gameId: `game_${input.application.applicationId}`,
    applicationId: input.application.applicationId,
    tournamentId: input.application.tournamentId,
    tournamentTitle: tournament.title,
    divisionName: input.divisionName,
    location: tournament.location,
    startsAt: tournament.startsAt,
    applicationStatus: input.application.status,
    paymentStatus: input.payment?.status ?? input.application.paymentStatus,
    paymentAmountKrw: input.payment?.amountKrw,
    supportChannel: input.application.supportChannel,
    dataSource: input.dataSource,
  };
}

function normalizeDuprId(duprId: string) {
  return duprId.trim().toUpperCase();
}

async function resolveApplicationDivisionId(tournamentId: string, requestedDivisionId?: string) {
  if (requestedDivisionId) return requestedDivisionId;
  const [defaultDivision] = await listTournamentDivisions(tournamentId);
  return defaultDivision?.divisionId;
}

async function seedSandboxTournaments() {
  await db.insert(tournaments).values(
    sandboxTournaments.map((tournament) => ({
      tournamentId: tournament.tournamentId,
      title: tournament.title,
      division: tournament.division,
      location: tournament.location,
      startsAt: new Date(tournament.startsAt),
      applicationStatus: tournament.applicationStatus,
      requiresDupr: tournament.requiresDupr,
      paymentMode: tournament.paymentMode,
      cancellationPolicy: tournament.cancellationPolicy,
    })),
  ).onConflictDoUpdate({
    target: tournaments.tournamentId,
    set: {
      title: sql`excluded.title`,
      division: sql`excluded.division`,
      location: sql`excluded.location`,
      startsAt: sql`excluded.starts_at`,
      applicationStatus: sql`excluded.application_status`,
      requiresDupr: sql`excluded.requires_dupr`,
      paymentMode: sql`excluded.payment_mode`,
      cancellationPolicy: sql`excluded.cancellation_policy`,
      updatedAt: new Date(),
    },
  });
  await db.insert(tournamentDivisions).values(sandboxDivisions.map((division) => ({
    divisionId: division.divisionId,
    tournamentId: division.tournamentId,
    name: division.name,
    skillLevel: division.skillLevel,
    teamType: division.teamType,
    entryFeeKrw: division.entryFeeKrw,
    capacityTeams: division.capacityTeams,
  }))).onConflictDoUpdate({
    target: tournamentDivisions.divisionId,
    set: {
      tournamentId: sql`excluded.tournament_id`,
      name: sql`excluded.name`,
      skillLevel: sql`excluded.skill_level`,
      teamType: sql`excluded.team_type`,
      entryFeeKrw: sql`excluded.entry_fee_krw`,
      capacityTeams: sql`excluded.capacity_teams`,
      updatedAt: new Date(),
    },
  });
}

async function seedSandboxApplications(participantId: string) {
  await getParticipantProfile();
  await seedSandboxTournaments();
  await db.insert(tournamentApplications).values(sandboxApplications.map((application) => ({
    applicationId: application.applicationId,
    tournamentId: application.tournamentId,
    divisionId: application.divisionId,
    participantId,
    duprId: application.duprId,
    status: application.status,
    submittedAt: new Date(application.submittedAt),
    supportChannel: 'oneToOneInquiry',
    paymentStatus: application.paymentStatus,
    refundPolicy: 'participantSelfCancelDisabled',
  }))).onConflictDoUpdate({
    target: tournamentApplications.applicationId,
    set: {
      tournamentId: sql`excluded.tournament_id`,
      divisionId: sql`excluded.division_id`,
      participantId: sql`excluded.participant_id`,
      duprId: sql`excluded.dupr_id`,
      status: sql`excluded.status`,
      submittedAt: sql`excluded.submitted_at`,
      supportChannel: sql`excluded.support_channel`,
      paymentStatus: sql`excluded.payment_status`,
      refundPolicy: sql`excluded.refund_policy`,
    },
  });
}

const sandboxDivisions = [
  { divisionId: 'division_sandbox_mixed_35', tournamentId: 'tournament_sandbox_001', name: '혼합복식', skillLevel: 'DUPR 3.5+', teamType: 'doubles', entryFeeKrw: 60000, capacityTeams: 32 },
  { divisionId: 'division_sandbox_mens_open', tournamentId: 'tournament_sandbox_001', name: '남자복식', skillLevel: 'DUPR 3.5~4.5', teamType: 'doubles', entryFeeKrw: 60000, capacityTeams: 64 },
  { divisionId: 'division_sandbox_womens_beginner', tournamentId: 'tournament_sandbox_002', name: '여자복식 초급', skillLevel: 'DUPR 제한없음', teamType: 'doubles', entryFeeKrw: 40000, capacityTeams: 24 },
  { divisionId: 'division_sandbox_mixed_beginner', tournamentId: 'tournament_sandbox_002', name: '혼합복식 초급', skillLevel: 'DUPR 3.0 이하 권장', teamType: 'doubles', entryFeeKrw: 40000, capacityTeams: 24 },
  { divisionId: 'division_sandbox_open_busan', tournamentId: 'tournament_sandbox_003', name: '오픈부', skillLevel: 'DUPR 4.0+', teamType: 'doubles', entryFeeKrw: 70000, capacityTeams: 48 },
  { divisionId: 'division_sandbox_senior_busan', tournamentId: 'tournament_sandbox_003', name: '시니어부', skillLevel: '만 50세 이상', teamType: 'doubles', entryFeeKrw: 50000, capacityTeams: 32 },
  { divisionId: 'division_sandbox_rookie_daejeon', tournamentId: 'tournament_sandbox_004', name: '입문자부', skillLevel: '대회 첫 참가자 권장', teamType: 'doubles', entryFeeKrw: 30000, capacityTeams: 32 },
  { divisionId: 'division_sandbox_mixed_daejeon', tournamentId: 'tournament_sandbox_004', name: '혼합복식', skillLevel: 'DUPR 제한없음', teamType: 'doubles', entryFeeKrw: 35000, capacityTeams: 32 },
].map((division) => tournamentDivisionSchema.parse(division));

const sandboxApplications = [
  { applicationId: 'application_sandbox_association_open_mixed', tournamentId: 'tournament_sandbox_001', divisionId: 'division_sandbox_mixed_35', duprId: 'DUPR-12345', status: 'submitted', submittedAt: '2026-07-14T01:20:00.000Z', paymentStatus: 'notStartedSandbox' },
  { applicationId: 'application_sandbox_seoul_rookie_womens', tournamentId: 'tournament_sandbox_002', divisionId: 'division_sandbox_womens_beginner', duprId: 'DUPR-12345', status: 'submitted', submittedAt: '2026-07-14T03:10:00.000Z', paymentStatus: 'notStartedSandbox' },
  { applicationId: 'application_sandbox_busan_open', tournamentId: 'tournament_sandbox_003', divisionId: 'division_sandbox_open_busan', duprId: 'DUPR-12345', status: 'submitted', submittedAt: '2026-07-14T05:40:00.000Z', paymentStatus: 'notStartedSandbox' },
];

function seedMemorySupportInquiries() {
  const now = '2026-07-13T09:00:00.000Z';
  memorySupportInquiries.set('inquiry_sandbox_refund', supportInquirySchema.parse({ inquiryId: 'inquiry_sandbox_refund', participantId: SANDBOX_PARTICIPANT_ID, channel: 'oneToOneInquiry', category: 'refund', subject: '환불/취소는 1:1 문의로 접수', status: 'operatorReview', createdAt: now }));
}

async function seedSandboxSupportInquiries() {
  await getParticipantProfile();
  await db.insert(supportInquiries).values([
    { inquiryId: 'inquiry_sandbox_refund', participantId: SANDBOX_PARTICIPANT_ID, applicationId: 'application_sandbox_association_open_mixed', channel: 'oneToOneInquiry', category: 'refund', subject: '환불 가능 시점 문의', status: 'operatorReview', createdAt: new Date('2026-07-13T09:00:00.000Z'), updatedAt: new Date('2026-07-13T09:00:00.000Z') },
    { inquiryId: 'inquiry_sandbox_partner_change', participantId: SANDBOX_PARTICIPANT_ID, applicationId: 'application_sandbox_seoul_rookie_womens', channel: 'oneToOneInquiry', category: 'application', subject: '파트너 변경 요청', status: 'closed', createdAt: new Date('2026-07-13T12:30:00.000Z'), updatedAt: new Date('2026-07-13T13:20:00.000Z') },
    { inquiryId: 'inquiry_sandbox_payment_receipt', participantId: SANDBOX_PARTICIPANT_ID, applicationId: 'application_sandbox_busan_open', channel: 'oneToOneInquiry', category: 'payment', subject: '입금 확인증 발급 문의', status: 'operatorReview', createdAt: new Date('2026-07-14T02:15:00.000Z'), updatedAt: new Date('2026-07-14T02:15:00.000Z') },
  ]).onConflictDoUpdate({
    target: supportInquiries.inquiryId,
    set: {
      participantId: sql`excluded.participant_id`,
      applicationId: sql`excluded.application_id`,
      channel: sql`excluded.channel`,
      category: sql`excluded.category`,
      subject: sql`excluded.subject`,
      status: sql`excluded.status`,
      updatedAt: new Date(),
    },
  });
}

function sandboxNotifications(participantId: string) {
  return [
    { notificationId: 'notification_sandbox_deadline', participantId, type: 'tournamentDeadline', title: '협회장배 접수 마감 임박', body: '혼합복식 부문 신청 마감이 가까워졌습니다.', relatedApplicationId: 'application_sandbox_association_open_mixed', createdAt: '2026-07-13T09:00:00.000Z' },
    { notificationId: 'notification_sandbox_support', participantId, type: 'support', title: '1:1 문의 답변 안내', body: '파트너 변경 요청에 대한 운영자 답변이 등록되었습니다.', relatedApplicationId: 'application_sandbox_seoul_rookie_womens', createdAt: '2026-07-13T08:30:00.000Z' },
    { notificationId: 'notification_sandbox_payment_confirmed', participantId, type: 'payment', title: '오프라인 입금 확인 완료', body: '부산 썸머 피클볼 챌린지 참가비 확인이 완료되었습니다.', relatedApplicationId: 'application_sandbox_busan_open', createdAt: '2026-07-14T04:00:00.000Z' },
    { notificationId: 'notification_sandbox_new_tournament', participantId, type: 'tournament', title: '새 대회가 열렸어요', body: '대전 루키스 데이 참가 접수가 시작되었습니다.', createdAt: '2026-07-14T05:00:00.000Z' },
  ];
}

async function seedSandboxNotifications(participantId: string) {
  await db.insert(notifications).values(sandboxNotifications(participantId).map((item) => ({ ...item, createdAt: new Date(item.createdAt) }))).onConflictDoUpdate({
    target: notifications.notificationId,
    set: {
      participantId: sql`excluded.participant_id`,
      type: sql`excluded.type`,
      title: sql`excluded.title`,
      body: sql`excluded.body`,
      relatedApplicationId: sql`excluded.related_application_id`,
    },
  });
}

function sandboxPaymentRecords(participantId: string, applications: TournamentApplication[]) {
  return applications.map((application) => paymentRecordSchema.parse({ paymentRecordId: `payment_${application.applicationId}`, applicationId: application.applicationId, participantId, amountKrw: 60000, paymentMode: 'operatorManagedOffline', status: 'notStartedSandbox', operatorNote: '운영자 오프라인 입금 확인 대기', recordedAt: application.submittedAt }));
}

async function seedSandboxPaymentRecords(participantId: string) {
  const applicationRows = await db.select().from(tournamentApplications).where(eq(tournamentApplications.participantId, participantId));
  if (applicationRows.length === 0) return;
  await db.insert(paymentRecords).values(applicationRows.map((application) => ({
    paymentRecordId: `payment_${application.applicationId}`,
    applicationId: application.applicationId,
    participantId,
    amountKrw: application.divisionId?.includes('womens_beginner') ? 40000 : application.divisionId?.includes('open_busan') ? 70000 : 60000,
    paymentMode: 'operatorManagedOffline',
    status: application.paymentStatus,
    operatorNote: application.paymentStatus === 'confirmedOffline' ? '운영자가 오프라인 입금을 확인했습니다.' : '운영자 오프라인 입금 확인 대기',
    recordedAt: application.submittedAt,
    updatedAt: new Date(),
  }))).onConflictDoUpdate({
    target: paymentRecords.paymentRecordId,
    set: {
      applicationId: sql`excluded.application_id`,
      participantId: sql`excluded.participant_id`,
      amountKrw: sql`excluded.amount_krw`,
      paymentMode: sql`excluded.payment_mode`,
      status: sql`excluded.status`,
      operatorNote: sql`excluded.operator_note`,
      recordedAt: sql`excluded.recorded_at`,
      updatedAt: new Date(),
    },
  });
}

function parseTournamentRow(row: typeof tournaments.$inferSelect) {
  return tournamentSchema.parse({
    tournamentId: row.tournamentId,
    title: row.title,
    division: row.division,
    location: row.location,
    startsAt: row.startsAt.toISOString(),
    applicationStatus: row.applicationStatus,
    requiresDupr: row.requiresDupr,
    paymentMode: row.paymentMode,
    cancellationPolicy: row.cancellationPolicy,
  });
}

function parseDivisionRow(row: typeof tournamentDivisions.$inferSelect) {
  return tournamentDivisionSchema.parse({
    divisionId: row.divisionId,
    tournamentId: row.tournamentId,
    name: row.name,
    skillLevel: row.skillLevel ?? undefined,
    teamType: row.teamType,
    entryFeeKrw: row.entryFeeKrw,
    capacityTeams: row.capacityTeams ?? undefined,
  });
}

function parseProfileRow(row: typeof participantProfiles.$inferSelect) {
  return participantProfileSchema.parse({
    participantId: row.participantId,
    displayName: row.displayName,
    duprId: row.duprId ?? undefined,
    duprStatus: row.duprStatus,
    supportChannel: row.supportChannel,
  });
}

function parseApplicationRow(row: typeof tournamentApplications.$inferSelect) {
  return tournamentApplicationSchema.parse({
    applicationId: row.applicationId,
    tournamentId: row.tournamentId,
    participantId: row.participantId,
    duprId: row.duprId,
    divisionId: row.divisionId ?? undefined,
    status: row.status,
    submittedAt: row.submittedAt.toISOString(),
    supportChannel: row.supportChannel,
    paymentStatus: row.paymentStatus,
    refundPolicy: row.refundPolicy,
  });
}

function parseSupportInquiryRow(row: typeof supportInquiries.$inferSelect) {
  return supportInquirySchema.parse({
    inquiryId: row.inquiryId,
    participantId: row.participantId ?? undefined,
    applicationId: row.applicationId ?? undefined,
    channel: row.channel,
    category: row.category,
    subject: customerSafeSupportSubject(row.subject),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  });
}

function customerSafeSupportSubject(subject: string) {
  return subject.replace(/MVP\s*/g, '').trim();
}

function parseNotificationRow(row: typeof notifications.$inferSelect) {
  return {
    notificationId: row.notificationId,
    participantId: row.participantId,
    type: row.type,
    title: row.title,
    body: row.body,
    relatedApplicationId: row.relatedApplicationId ?? undefined,
    readAt: row.readAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function parsePaymentRecordRow(row: typeof paymentRecords.$inferSelect) {
  return paymentRecordSchema.parse({
    paymentRecordId: row.paymentRecordId,
    applicationId: row.applicationId,
    participantId: row.participantId,
    amountKrw: row.amountKrw,
    paymentMode: row.paymentMode,
    status: row.status,
    operatorNote: row.operatorNote ?? undefined,
    recordedAt: row.recordedAt.toISOString(),
  });
}

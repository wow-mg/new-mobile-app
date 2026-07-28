import { z } from 'zod';

const idSchema = z.string().trim().min(1);
const timestampSchema = z.string().datetime();

export const poolKoDivisionStatusSchema = z.enum([
  'draft',
  'generated',
  'review_complete',
  'locked',
  'published',
  'archived',
  'cancelled',
]);
export type PoolKoDivisionStatus = z.infer<typeof poolKoDivisionStatusSchema>;

export const poolKoScoringConfigSchema = z.object({
  bestOfGames: z.number().int().positive(),
  gamesToWin: z.number().int().positive(),
  pointsToWin: z.number().int().positive(),
  winBy: z.number().int().positive(),
}).strict().refine(
  ({ bestOfGames, gamesToWin }) => gamesToWin <= bestOfGames,
  'gamesToWin cannot exceed bestOfGames',
);
export type PoolKoScoringConfig = z.infer<typeof poolKoScoringConfigSchema>;

export const poolKoDivisionSchema = z.object({
  divisionId: idSchema,
  format: z.literal('POOL_KO'),
  status: poolKoDivisionStatusSchema,
  kPerPool: z.object({
    value: z.number().int().positive(),
    source: z.enum(['default', 'override']),
  }).strict(),
  poolScoringConfig: poolKoScoringConfigSchema,
  koScoringConfig: poolKoScoringConfigSchema,
  withdrawalRule: z.enum([
    'preserve_played_default_remaining',
    'invalidate_if_less_than_half_played',
  ]),
  publicDrawPolicy: z.literal('explicit_audited_resolution'),
  lockState: z.object({
    isLocked: z.boolean(),
    reviewCompletedAt: timestampSchema.optional(),
    lockedAt: timestampSchema.optional(),
    lockedBy: idSchema.optional(),
  }).strict(),
  publishState: z.object({
    isPublished: z.boolean(),
    publishedAt: timestampSchema.optional(),
    publishedBy: idSchema.optional(),
  }).strict(),
}).strict();
export type PoolKoDivision = z.infer<typeof poolKoDivisionSchema>;

export const poolKoEntrantSchema = z.object({
  entrantId: idSchema,
  teamId: idSchema,
  displayName: z.string().trim().min(1).optional(),
  seed: z.number().int().positive(),
  clubId: idSchema.optional(),
  originalDivisionId: idSchema,
  mergedIntoDivisionId: idSchema.optional(),
  withdrawalStatus: z.enum(['active', 'withdrawn', 'defaulted']),
}).strict();
export type PoolKoEntrant = z.infer<typeof poolKoEntrantSchema>;

export const manualAdjustmentAuditSchema = z.object({
  auditEventId: idSchema,
  actorId: idSchema,
  occurredAt: timestampSchema,
  reason: z.string().trim().min(1),
}).strict();
export type ManualAdjustmentAudit = z.infer<typeof manualAdjustmentAuditSchema>;

export const poolSchema = z.object({
  poolId: idSchema,
  divisionId: idSchema,
  label: z.string().trim().min(1),
  order: z.number().int().nonnegative(),
  entrantIds: z.array(idSchema).min(3).max(5),
  roundRobinMatchIds: z.array(idSchema),
  manualAdjustment: manualAdjustmentAuditSchema.optional(),
}).strict();
export type Pool = z.infer<typeof poolSchema>;

export const publicDrawResolutionSchema = z.object({
  drawId: idSchema,
  candidateEntrantIds: z.array(idSchema).min(2),
  orderedEntrantIds: z.array(idSchema).min(2),
  operatorId: idSchema,
  resolvedAt: timestampSchema,
}).strict().superRefine((value, context) => {
  const candidates = [...value.candidateEntrantIds].sort();
  const ordered = [...value.orderedEntrantIds].sort();
  if (new Set(candidates).size !== candidates.length || candidates.join('|') !== ordered.join('|')) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'orderedEntrantIds must be a permutation of unique candidateEntrantIds',
    });
  }
});
export type PublicDrawResolution = z.infer<typeof publicDrawResolutionSchema>;

export const poolKoSlotSchema = z.object({
  slotId: idSchema,
  entrantId: idSchema.optional(),
  withdrawnEntrantId: idSchema.optional(),
  state: z.enum(['assigned', 'tbd', 'bye', 'withdrawn']),
  source: z.object({
    kind: z.enum(['pool_rank', 'match_winner', 'manual']),
    poolId: idSchema.optional(),
    rank: z.number().int().positive().optional(),
    matchId: idSchema.optional(),
  }).strict().optional(),
}).strict();
export type PoolKoSlot = z.infer<typeof poolKoSlotSchema>;

export const poolKoGameScoreSchema = z.object({
  homeScore: z.number().int().nonnegative(),
  awayScore: z.number().int().nonnegative(),
}).strict();
export type PoolKoGameScore = z.infer<typeof poolKoGameScoreSchema>;

export const poolKoMatchSchema = z.object({
  matchId: idSchema,
  divisionId: idSchema,
  stage: z.enum(['pool', 'ko']),
  poolId: idSchema.optional(),
  round: z.number().int().positive(),
  slots: z.tuple([poolKoSlotSchema, poolKoSlotSchema]),
  scoreState: z.enum(['scheduled', 'completed', 'defaulted', 'invalidated']),
  games: z.array(poolKoGameScoreSchema),
  defaultMetadata: z.object({
    defaultedEntrantId: idSchema,
    reason: z.string().trim().min(1),
    auditEventId: idSchema,
  }).strict().optional(),
  updatedByAuditEventId: idSchema.optional(),
}).strict();
export type PoolKoMatch = z.infer<typeof poolKoMatchSchema>;

export const poolStandingSchema = z.object({
  poolId: idSchema,
  entrantId: idSchema,
  rank: z.number().int().positive(),
  wins: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  gameDifferential: z.number().int(),
  pointDifferential: z.number().int(),
  headToHead: z.object({
    applied: z.boolean(),
    opponentEntrantIds: z.array(idSchema),
  }).strict(),
  tieStatus: z.enum(['resolved', 'public_draw_resolved']),
  publicDrawId: idSchema.optional(),
  derivedFromMatchIds: z.array(idSchema),
}).strict();
export type PoolStanding = z.infer<typeof poolStandingSchema>;

export const koQualifierSchema = z.object({
  entrantId: idSchema,
  poolId: idSchema,
  poolRank: z.number().int().positive(),
  seedOrder: z.number().int().positive(),
}).strict();
export type KoQualifier = z.infer<typeof koQualifierSchema>;

export const koBracketSchema = z.object({
  divisionId: idSchema,
  bracketSize: z.number().int().positive(),
  rounds: z.array(z.object({
    round: z.number().int().positive(),
    matches: z.array(poolKoMatchSchema),
  }).strict()).min(1),
  rematchAvoidanceStatus: z.enum(['not_required', 'avoided', 'unavoidable']),
}).strict();
export type KoBracket = z.infer<typeof koBracketSchema>;

const baseAuditEventSchema = z.object({
  auditEventId: idSchema,
  divisionId: idSchema,
  actorId: idSchema,
  occurredAt: timestampSchema,
  entrantId: idSchema.optional(),
  originalDivisionId: idSchema.optional(),
  mergedIntoDivisionId: idSchema.optional(),
  stateAtEvent: poolKoDivisionStatusSchema.optional(),
});

const simpleAuditTypes = z.enum([
  'generation_requested',
  'generation_completed',
  'review_completed',
  'locked',
  'published',
  'score_entered',
  'score_updated',
  'public_draw_created',
]);

export const poolKoAuditEventSchema = z.union([
  baseAuditEventSchema.extend({ type: simpleAuditTypes }).strict(),
  baseAuditEventSchema.extend({
    type: z.enum([
      'pool_assignment_adjusted',
      'ko_slot_adjusted',
      'post_lock_changed',
      'post_publish_changed',
    ]),
    reason: z.string().trim().min(1),
  }).strict(),
  baseAuditEventSchema.extend({
    type: z.literal('public_draw_resolved'),
    publicDraw: publicDrawResolutionSchema,
  }).strict(),
  baseAuditEventSchema.extend({
    type: z.enum(['withdrawal_applied', 'default_applied']),
    reason: z.string().trim().min(1),
    entrantId: idSchema,
  }).strict(),
]).superRefine((event, context) => {
  if (
    'stateAtEvent' in event
    && (event.stateAtEvent === 'locked' || event.stateAtEvent === 'published')
    && !('reason' in event)
    && event.type !== 'public_draw_resolved'
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'post-lock and post-publish changes require a reason',
    });
  }
});
export type PoolKoAuditEvent = z.infer<typeof poolKoAuditEventSchema>;

export const poolKoPermissionsSchema = z.object({
  operator: z.object({
    canGenerate: z.literal(true),
    canReview: z.literal(true),
    canLock: z.literal(true),
    canPublish: z.literal(true),
    canResolvePublicDraw: z.literal(true),
    canAdjustAssignmentsWithReason: z.literal(true),
  }).strict(),
  courtStaff: z.object({ canEnterScore: z.literal(true) }).strict(),
  participant: z.object({ canViewPublished: z.literal(true) }).strict(),
}).strict();
export type PoolKoPermissions = z.infer<typeof poolKoPermissionsSchema>;

export const poolKoSnapshotSchema = z.object({
  division: poolKoDivisionSchema,
  entrants: z.array(poolKoEntrantSchema),
  pools: z.array(poolSchema),
  matches: z.array(poolKoMatchSchema),
  standings: z.array(poolStandingSchema),
  koBracket: koBracketSchema.optional(),
  auditEvents: z.array(poolKoAuditEventSchema),
  permissions: poolKoPermissionsSchema,
}).strict();
export type PoolKoSnapshot = z.infer<typeof poolKoSnapshotSchema>;

export type PoolKoEngineError =
  | { code: 'ADMIN_DECISION_REQUIRED'; message: string }
  | { code: 'INVALID_INPUT'; message: string }
  | { code: 'PUBLIC_DRAW_REQUIRED'; message: string; candidateEntrantIds: string[] };

type EngineResult<T> = ({ ok: true } & T) | { ok: false; error: PoolKoEngineError };

export function assignPools(input: {
  divisionId: string;
  entrants: PoolKoEntrant[];
}): EngineResult<{ pools: Pool[] }> {
  if (input.entrants.length < 3) {
    return {
      ok: false,
      error: {
        code: 'ADMIN_DECISION_REQUIRED',
        message: 'At least 3 entrants are required for automatic pool assignment',
      },
    };
  }
  const entrantIds = input.entrants.map(({ entrantId }) => entrantId);
  if (new Set(entrantIds).size !== entrantIds.length) {
    return invalid('Entrant ids must be unique');
  }

  const sizes = poolSizes(input.entrants.length);
  let entrantOffset = 0;
  const pools = sizes.map((size, index) => {
    const poolId = `${input.divisionId}-pool-${index + 1}`;
    const pool: Pool = {
      poolId,
      divisionId: input.divisionId,
      label: poolLabel(index),
      order: index,
      entrantIds: input.entrants.slice(entrantOffset, entrantOffset + size).map(({ entrantId }) => entrantId),
      roundRobinMatchIds: [],
    };
    entrantOffset += size;
    return pool;
  });
  return { ok: true, pools };
}

function poolSizes(entrantCount: number): number[] {
  if (entrantCount === 5) return [5];
  const poolCount = Math.ceil(entrantCount / 4);
  const baseSize = Math.floor(entrantCount / poolCount);
  const largerPoolCount = entrantCount % poolCount;
  return Array.from(
    { length: poolCount },
    (_, index) => baseSize + (index < largerPoolCount ? 1 : 0),
  );
}

function poolLabel(index: number): string {
  return String.fromCharCode('A'.charCodeAt(0) + index);
}

export function generateRoundRobin(input: {
  divisionId: string;
  poolId: string;
  entrantIds: string[];
}): EngineResult<{ matches: PoolKoMatch[] }> {
  if (input.entrantIds.length < 3 || input.entrantIds.length > 5) {
    return invalid('Round robin requires 3 to 5 entrants');
  }
  if (new Set(input.entrantIds).size !== input.entrantIds.length) {
    return invalid('Entrant ids must be unique');
  }

  const rotation: Array<string | null> = [...input.entrantIds];
  if (rotation.length % 2 === 1) rotation.push(null);
  const roundCount = rotation.length - 1;
  const matches: PoolKoMatch[] = [];
  for (let roundIndex = 0; roundIndex < roundCount; roundIndex += 1) {
    for (let pairIndex = 0; pairIndex < rotation.length / 2; pairIndex += 1) {
      const home = rotation[pairIndex];
      const away = rotation[rotation.length - 1 - pairIndex];
      if (home && away) {
        const matchId = `${input.poolId}-round-${roundIndex + 1}-match-${pairIndex + 1}`;
        matches.push(scheduledMatch(
          matchId,
          input.divisionId,
          'pool',
          roundIndex + 1,
          home,
          away,
          input.poolId,
        ));
      }
    }
    rotation.splice(1, 0, rotation.pop() ?? null);
  }
  return { ok: true, matches };
}

export function rankPool(input: {
  poolId: string;
  entrantIds: string[];
  matches: PoolKoMatch[];
  headToHeadRule: 'disabled' | 'only_two_way';
  publicDraws?: PublicDrawResolution[];
}): EngineResult<{ standings: PoolStanding[] }> {
  const stats = new Map(input.entrantIds.map((entrantId) => [entrantId, {
    entrantId,
    wins: 0,
    losses: 0,
    gameDifferential: 0,
    pointDifferential: 0,
    derivedFromMatchIds: [] as string[],
    headToHead: { applied: false, opponentEntrantIds: [] as string[] },
    publicDrawId: undefined as string | undefined,
  }]));

  for (const match of input.matches) {
    if (
      match.poolId !== input.poolId
      || match.scoreState === 'scheduled'
      || match.scoreState === 'invalidated'
    ) continue;
    const homeId = match.slots[0].entrantId;
    const awayId = match.slots[1].entrantId;
    const home = homeId ? stats.get(homeId) : undefined;
    const away = awayId ? stats.get(awayId) : undefined;
    if (!home || !away) continue;
    if (match.games.length === 0) {
      return invalid(`Recorded match ${match.matchId} must contain at least one game`);
    }
    let homeGames = 0;
    let awayGames = 0;
    for (const game of match.games) {
      home.pointDifferential += game.homeScore - game.awayScore;
      away.pointDifferential += game.awayScore - game.homeScore;
      if (game.homeScore > game.awayScore) homeGames += 1;
      if (game.awayScore > game.homeScore) awayGames += 1;
    }
    home.gameDifferential += homeGames - awayGames;
    away.gameDifferential += awayGames - homeGames;
    if (homeGames === awayGames) {
      return invalid(`Recorded match ${match.matchId} must have a game winner`);
    }
    const winner = homeGames > awayGames ? home : away;
    const loser = winner === home ? away : home;
    winner.wins += 1;
    loser.losses += 1;
    home.derivedFromMatchIds.push(match.matchId);
    away.derivedFromMatchIds.push(match.matchId);
  }

  const ordered = [...stats.values()].sort(compareStats);
  let index = 0;
  while (index < ordered.length) {
    let end = index + 1;
    while (end < ordered.length && compareStats(ordered[index], ordered[end]) === 0) end += 1;
    const tied = ordered.slice(index, end);
    if (tied.length > 1 && input.headToHeadRule === 'only_two_way' && tied.length === 2) {
      const headToHeadWinner = findHeadToHeadWinner(tied[0].entrantId, tied[1].entrantId, input.matches);
      if (headToHeadWinner) {
        tied.sort((left, right) => {
          if (left.entrantId === headToHeadWinner) return -1;
          if (right.entrantId === headToHeadWinner) return 1;
          return 0;
        });
        tied.forEach((row) => {
          row.headToHead = {
            applied: true,
            opponentEntrantIds: tied.filter((other) => other !== row).map((other) => other.entrantId),
          };
        });
        ordered.splice(index, tied.length, ...tied);
        index = end;
        continue;
      }
    }
    if (tied.length > 1) {
      const candidateEntrantIds = tied.map(({ entrantId }) => entrantId).sort();
      const validatedDraws = (input.publicDraws ?? []).map((candidate) =>
        publicDrawResolutionSchema.safeParse(candidate));
      const malformedDraw = validatedDraws.find((candidate) => !candidate.success);
      if (malformedDraw) return invalid('Public draw resolution must include valid audit metadata');
      const draw = validatedDraws
        .filter((candidate): candidate is { success: true; data: PublicDrawResolution } => candidate.success)
        .map(({ data }) => data)
        .find((candidate) => sameIds(candidate.candidateEntrantIds, candidateEntrantIds));
      if (!draw || !sameIds(draw.orderedEntrantIds, candidateEntrantIds)) {
        return {
          ok: false,
          error: {
            code: 'PUBLIC_DRAW_REQUIRED',
            message: 'An explicit audited public draw is required to resolve the remaining tie',
            candidateEntrantIds,
          },
        };
      }
      tied.sort((left, right) =>
        draw.orderedEntrantIds.indexOf(left.entrantId) - draw.orderedEntrantIds.indexOf(right.entrantId));
      tied.forEach((row) => { row.publicDrawId = draw.drawId; });
      ordered.splice(index, tied.length, ...tied);
    }
    index = end;
  }

  return {
    ok: true,
    standings: ordered.map((row, standingIndex) => ({
      poolId: input.poolId,
      entrantId: row.entrantId,
      rank: standingIndex + 1,
      wins: row.wins,
      losses: row.losses,
      gameDifferential: row.gameDifferential,
      pointDifferential: row.pointDifferential,
      headToHead: row.headToHead,
      tieStatus: row.publicDrawId ? 'public_draw_resolved' : 'resolved',
      ...(row.publicDrawId ? { publicDrawId: row.publicDrawId } : {}),
      derivedFromMatchIds: row.derivedFromMatchIds,
    })),
  };
}

function compareStats(
  left: { wins: number; gameDifferential: number; pointDifferential: number },
  right: { wins: number; gameDifferential: number; pointDifferential: number },
): number {
  return right.wins - left.wins
    || right.gameDifferential - left.gameDifferential
    || right.pointDifferential - left.pointDifferential;
}

function findHeadToHeadWinner(
  firstEntrantId: string,
  secondEntrantId: string,
  matches: PoolKoMatch[],
): string | undefined {
  const match = matches.find((candidate) =>
    candidate.scoreState !== 'scheduled'
    && candidate.scoreState !== 'invalidated'
    && sameIds(
      candidate.slots.flatMap(({ entrantId }) => entrantId ? [entrantId] : []),
      [firstEntrantId, secondEntrantId],
    ));
  if (!match) return undefined;
  const [home, away] = match.slots;
  let gameBalance = 0;
  for (const game of match.games) {
    if (game.homeScore > game.awayScore) gameBalance += 1;
    if (game.awayScore > game.homeScore) gameBalance -= 1;
  }
  if (gameBalance === 0) return undefined;
  return gameBalance > 0 ? home.entrantId : away.entrantId;
}

function sameIds(left: string[], right: string[]): boolean {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

export function mapQualifiersToKo(input: {
  pools: Array<{ poolId: string; standings: PoolStanding[] }>;
  kPerPool: number;
}): EngineResult<{ qualifiers: KoQualifier[]; rematchAvoidanceStatus: KoBracket['rematchAvoidanceStatus'] }> {
  if (!Number.isInteger(input.kPerPool) || input.kPerPool < 1) {
    return invalid('kPerPool must be a positive integer');
  }
  if (input.pools.some(({ standings }) => standings.length < input.kPerPool)) {
    return invalid('Every pool must have at least kPerPool ranked entrants');
  }

  const qualifiers: KoQualifier[] = [];
  for (let rankIndex = 0; rankIndex < input.kPerPool; rankIndex += 1) {
    const shouldReverse = input.pools.length % 2 === 1 && rankIndex % 2 === 1;
    const poolOrder = shouldReverse ? [...input.pools].reverse() : input.pools;
    for (const pool of poolOrder) {
      const standing = [...pool.standings].sort((left, right) => left.rank - right.rank)[rankIndex];
      qualifiers.push({
        entrantId: standing.entrantId,
        poolId: pool.poolId,
        poolRank: standing.rank,
        seedOrder: qualifiers.length + 1,
      });
    }
  }
  return {
    ok: true,
    qualifiers,
    rematchAvoidanceStatus: input.pools.length < 2 ? 'not_required' : 'avoided',
  };
}

export function generateKoBracket(input: {
  divisionId: string;
  qualifiers: KoQualifier[];
}): EngineResult<{ bracket: KoBracket }> {
  if (input.qualifiers.length < 2) return invalid('At least two qualifiers are required');
  if (new Set(input.qualifiers.map(({ entrantId }) => entrantId)).size !== input.qualifiers.length) {
    return invalid('Qualifier entrant ids must be unique');
  }
  const seedOrders = input.qualifiers.map(({ seedOrder }) => seedOrder).sort((left, right) => left - right);
  if (
    new Set(seedOrders).size !== seedOrders.length
    || seedOrders.some((seedOrder, index) => seedOrder !== index + 1)
  ) {
    return invalid('Qualifier seedOrder values must be unique and contiguous from 1');
  }
  const qualifiers = [...input.qualifiers].sort((left, right) => left.seedOrder - right.seedOrder);
  const bracketSize = 2 ** Math.ceil(Math.log2(qualifiers.length));
  const seedPositions = bracketSeedPositions(bracketSize);
  const qualifierBySeed = new Map(qualifiers.map((qualifier) => [qualifier.seedOrder, qualifier]));
  const positioned = seedPositions.map((seed) => qualifierBySeed.get(seed));
  const rounds: KoBracket['rounds'] = [];
  let matchesInRound = bracketSize / 2;

  for (let round = 1; matchesInRound >= 1; round += 1) {
    const matches: PoolKoMatch[] = [];
    for (let matchIndex = 0; matchIndex < matchesInRound; matchIndex += 1) {
      const matchId = `${input.divisionId}-ko-round-${round}-match-${matchIndex + 1}`;
      if (round === 1) {
        const home = positioned[matchIndex * 2];
        const away = positioned[matchIndex * 2 + 1];
        matches.push({
          matchId,
          divisionId: input.divisionId,
          stage: 'ko',
          round,
          slots: [
            qualifierSlot(`${matchId}-home`, home),
            qualifierSlot(`${matchId}-away`, away),
          ],
          scoreState: 'scheduled',
          games: [],
        });
      } else {
        matches.push({
          matchId,
          divisionId: input.divisionId,
          stage: 'ko',
          round,
          slots: [
            {
              slotId: `${matchId}-home`,
              state: 'tbd',
              source: {
                kind: 'match_winner',
                matchId: `${input.divisionId}-ko-round-${round - 1}-match-${matchIndex * 2 + 1}`,
              },
            },
            {
              slotId: `${matchId}-away`,
              state: 'tbd',
              source: {
                kind: 'match_winner',
                matchId: `${input.divisionId}-ko-round-${round - 1}-match-${matchIndex * 2 + 2}`,
              },
            },
          ],
          scoreState: 'scheduled',
          games: [],
        });
      }
    }
    rounds.push({ round, matches });
    matchesInRound /= 2;
  }

  const firstRoundSamePool = rounds[0].matches.some((match) => {
    const [home, away] = match.slots.map(({ entrantId }) =>
      qualifiers.find((qualifier) => qualifier.entrantId === entrantId));
    return home && away && home.poolId === away.poolId;
  });
  return {
    ok: true,
    bracket: {
      divisionId: input.divisionId,
      bracketSize,
      rounds,
      rematchAvoidanceStatus: firstRoundSamePool ? 'unavoidable' : 'avoided',
    },
  };
}

function bracketSeedPositions(size: number): number[] {
  let positions = [1, 2];
  while (positions.length < size) {
    const nextSize = positions.length * 2 + 1;
    positions = positions.flatMap((seed) => [seed, nextSize - seed]);
  }
  return positions;
}

function qualifierSlot(slotId: string, qualifier?: KoQualifier): PoolKoSlot {
  if (!qualifier) return { slotId, state: 'bye' };
  return {
    slotId,
    entrantId: qualifier.entrantId,
    state: 'assigned',
    source: {
      kind: 'pool_rank',
      poolId: qualifier.poolId,
      rank: qualifier.poolRank,
    },
  };
}

export function applyWithdrawal(input: {
  stage: 'pool' | 'ko';
  withdrawnEntrantId: string;
  matches: PoolKoMatch[];
  withdrawalRule: PoolKoDivision['withdrawalRule'];
  reason: string;
  postPublication?: boolean;
  audit: Omit<ManualAdjustmentAudit, 'reason'>;
}): EngineResult<{ matches: PoolKoMatch[]; invalidatedMatchIds: string[] }> {
  const scheduledForEntrant = input.matches.filter((match) =>
    match.stage === input.stage
    && match.slots.some(({ entrantId }) => entrantId === input.withdrawnEntrantId));
  if (scheduledForEntrant.length === 0) return invalid('Withdrawn entrant is not present in any match');
  if (input.stage === 'ko' && input.postPublication !== true) {
    return invalid('KO withdrawal handling requires explicit postPublication state');
  }

  const playedCount = scheduledForEntrant.filter((match) =>
    match.scoreState === 'completed' || match.scoreState === 'defaulted').length;
  const invalidateAll = input.stage === 'pool'
    && input.withdrawalRule === 'invalidate_if_less_than_half_played'
    && playedCount * 2 < scheduledForEntrant.length;
  const invalidatedMatchIds: string[] = [];

  const matches = input.matches.map((match) => {
    if (match.stage !== input.stage) return match;
    const withdrawnSlotIndex = match.slots.findIndex(
      ({ entrantId }) => entrantId === input.withdrawnEntrantId,
    );
    if (withdrawnSlotIndex < 0) return match;
    if (invalidateAll) {
      invalidatedMatchIds.push(match.matchId);
      return {
        ...match,
        scoreState: 'invalidated' as const,
        games: [],
        updatedByAuditEventId: input.audit.auditEventId,
      };
    }
    if (input.stage === 'ko') {
      const slots: PoolKoMatch['slots'] = [
        { ...match.slots[0] },
        { ...match.slots[1] },
      ];
      slots[withdrawnSlotIndex] = {
        slotId: slots[withdrawnSlotIndex].slotId,
        state: 'bye',
        withdrawnEntrantId: input.withdrawnEntrantId,
        ...(slots[withdrawnSlotIndex].source ? { source: slots[withdrawnSlotIndex].source } : {}),
      };
      return { ...match, slots, updatedByAuditEventId: input.audit.auditEventId };
    }
    if (match.scoreState !== 'scheduled') return match;

    const withdrawnIsHome = withdrawnSlotIndex === 0;
    return {
      ...match,
      scoreState: 'defaulted' as const,
      games: [{
        homeScore: withdrawnIsHome ? 0 : 11,
        awayScore: withdrawnIsHome ? 11 : 0,
      }],
      defaultMetadata: {
        defaultedEntrantId: input.withdrawnEntrantId,
        reason: input.reason,
        auditEventId: input.audit.auditEventId,
      },
      updatedByAuditEventId: input.audit.auditEventId,
    };
  });
  return { ok: true, matches, invalidatedMatchIds };
}

function scheduledMatch(
  matchId: string,
  divisionId: string,
  stage: 'pool' | 'ko',
  round: number,
  homeEntrantId: string,
  awayEntrantId: string,
  poolId?: string,
): PoolKoMatch {
  return {
    matchId,
    divisionId,
    stage,
    ...(poolId ? { poolId } : {}),
    round,
    slots: [
      { slotId: `${matchId}-home`, entrantId: homeEntrantId, state: 'assigned' },
      { slotId: `${matchId}-away`, entrantId: awayEntrantId, state: 'assigned' },
    ],
    scoreState: 'scheduled',
    games: [],
  };
}

function invalid(message: string): { ok: false; error: PoolKoEngineError } {
  return { ok: false, error: { code: 'INVALID_INPUT', message } };
}

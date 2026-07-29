import {
  assignPools,
  generateKoBracket,
  generateRoundRobin,
  mapQualifiersToKo,
  poolKoAuditEventSchema,
  poolKoDivisionSchema,
  publicDrawResolutionSchema,
  rankPool,
  type KoBracket,
  type Pool,
  type PoolKoAuditEvent,
  type PoolKoDivision,
  type PoolKoEntrant,
  type PoolKoGameScore,
  type PoolKoMatch,
  type PoolStanding,
  type PublicDrawResolution,
} from '@template/contracts';

type AdminActor = {
  role: 'operator' | 'courtStaff';
  actorId: string;
  occurredAt: string;
};

export type PoolKoAdminError = {
  code: 'PERMISSION_DENIED' | 'INVALID_TRANSITION' | 'INVALID_INPUT' | 'REASON_REQUIRED';
  message: string;
};

export type PoolKoAdminState = {
  division: PoolKoDivision;
  entrants: PoolKoEntrant[];
  pools: Pool[];
  matches: PoolKoMatch[];
  standings: PoolStanding[];
  koBracket?: KoBracket;
  publicDraws: PublicDrawResolution[];
  auditEvents: PoolKoAuditEvent[];
  scoreReviewComplete: boolean;
  printPackRequests: Array<{
    fileName: 'print_pack.pdf';
    divisionId: string;
    requestedBy: string;
    requestedAt: string;
  }>;
};

export type PoolKoAdminAction =
  | ({ type: 'mergeDivision'; sourceDivisionId: string; entrants: PoolKoEntrant[]; reason: string } & AdminActor)
  | ({ type: 'generatePools' } & AdminActor)
  | ({
      type: 'reorderPoolEntrant';
      entrantId: string;
      toPoolId: string;
      swapWithEntrantId?: string;
      reason?: string;
    } & AdminActor)
  | ({ type: 'completeReview' } & AdminActor)
  | ({ type: 'lockPools' } & AdminActor)
  | ({ type: 'recordScore'; matchId: string; games: PoolKoGameScore[] } & AdminActor)
  | ({ type: 'reviewScores' } & AdminActor)
  | ({ type: 'resolvePublicDraw'; poolId: string; publicDraw: PublicDrawResolution } & AdminActor)
  | ({ type: 'previewKo' } & AdminActor)
  | ({
      type: 'reorderKoSlots';
      firstSlotId: string;
      secondSlotId: string;
      reason?: string;
    } & AdminActor)
  | ({ type: 'publish' } & AdminActor)
  | ({ type: 'requestPrintPack' } & AdminActor);

type AdminResult<T> = { ok: true; state: T } | { ok: false; error: PoolKoAdminError };

export type LocalBatchAxis = {
  bandId: string;
  label: string;
};

export function generateDivisionBatch(input: {
  eventId: string;
  duprBands: LocalBatchAxis[];
  ageBands: LocalBatchAxis[];
  entrantsByDivision: Record<string, PoolKoEntrant[] | undefined>;
}) {
  return input.duprBands.flatMap((duprBand) =>
    input.ageBands.map((ageBand) => {
      const divisionId = `${input.eventId}:${duprBand.bandId}:${ageBand.bandId}`;
      const entrantCount = input.entrantsByDivision[divisionId]?.length ?? 0;
      return {
        divisionId,
        eventId: input.eventId,
        duprBand,
        ageBand,
        entrantCount,
        decision: entrantCount >= 3 ? 'ready' as const : 'admin_required' as const,
      };
    }));
}

export function createPoolKoAdminState(input: {
  divisionId: string;
  entrants: PoolKoEntrant[];
  pools?: Pool[];
  matches?: PoolKoMatch[];
  standings?: PoolStanding[];
}): PoolKoAdminState {
  const division = poolKoDivisionSchema.parse({
    divisionId: input.divisionId,
    format: 'POOL_KO',
    status: input.pools?.length ? 'generated' : 'draft',
    kPerPool: { value: 2, source: 'default' },
    poolScoringConfig: { bestOfGames: 1, gamesToWin: 1, pointsToWin: 15, winBy: 2 },
    koScoringConfig: { bestOfGames: 3, gamesToWin: 2, pointsToWin: 11, winBy: 2 },
    withdrawalRule: 'preserve_played_default_remaining',
    publicDrawPolicy: 'explicit_audited_resolution',
    lockState: { isLocked: false },
    publishState: { isPublished: false },
  });
  return {
    division,
    entrants: input.entrants.map((entrant) => ({ ...entrant })),
    pools: input.pools?.map(clonePool) ?? [],
    matches: input.matches?.map(cloneMatch) ?? [],
    standings: input.standings?.map((standing) => ({ ...standing })) ?? [],
    publicDraws: [],
    auditEvents: [],
    scoreReviewComplete: false,
    printPackRequests: [],
  };
}

export function applyPoolKoAdminAction(
  current: PoolKoAdminState,
  action: PoolKoAdminAction,
): AdminResult<PoolKoAdminState> {
  if (isOperatorAction(action) && action.role !== 'operator') {
    return failure('PERMISSION_DENIED', 'This action requires the operator role');
  }
  if (isCourtStaffAction(action) && action.role !== 'courtStaff') {
    return failure('PERMISSION_DENIED', 'Only court staff can enter and review scores');
  }
  const state = cloneState(current);

  switch (action.type) {
    case 'mergeDivision':
      return mergeDivision(state, action);
    case 'generatePools':
      return generatePools(state, action);
    case 'reorderPoolEntrant':
      return reorderPoolEntrant(state, action);
    case 'completeReview':
      if (state.division.status !== 'generated') {
        return failure('INVALID_TRANSITION', 'Pool review can complete only after generation');
      }
      state.division = {
        ...state.division,
        status: 'review_complete',
        lockState: { ...state.division.lockState, reviewCompletedAt: action.occurredAt },
      };
      appendAudit(state, action, { type: 'review_completed' });
      return success(state);
    case 'lockPools':
      if (state.division.status !== 'review_complete') {
        return failure('INVALID_TRANSITION', 'Review must be complete before pools are locked');
      }
      state.division = {
        ...state.division,
        status: 'locked',
        lockState: {
          ...state.division.lockState,
          isLocked: true,
          lockedAt: action.occurredAt,
          lockedBy: action.actorId,
        },
      };
      appendAudit(state, action, { type: 'locked' });
      return success(state);
    case 'recordScore':
      if (state.division.status !== 'locked') {
        return failure('INVALID_TRANSITION', 'Scores can be entered only after pools are locked');
      }
      return recordScore(state, action);
    case 'reviewScores':
      if (state.division.status !== 'locked') {
        return failure('INVALID_TRANSITION', 'Scores can be reviewed only after pools are locked');
      }
      if (!state.matches.some(({ scoreState }) => scoreState === 'completed' || scoreState === 'defaulted')) {
        return failure('INVALID_TRANSITION', 'At least one recorded score is required for score review');
      }
      {
        const standings = deriveStandings(state);
        if (!standings.ok) return standings;
        state.standings = standings.standings;
      }
      state.scoreReviewComplete = true;
      appendAudit(state, action, { type: 'score_updated' });
      return success(state);
    case 'resolvePublicDraw':
      return resolvePublicDraw(state, action);
    case 'previewKo':
      return previewKo(state, action);
    case 'reorderKoSlots':
      return reorderKoSlots(state, action);
    case 'publish':
      if (state.division.status !== 'locked') {
        return failure('INVALID_TRANSITION', 'Publish is allowed only from locked state');
      }
      state.division = {
        ...state.division,
        status: 'published',
        publishState: {
          isPublished: true,
          publishedAt: action.occurredAt,
          publishedBy: action.actorId,
        },
      };
      appendAudit(state, action, { type: 'published' });
      return success(state);
    case 'requestPrintPack':
      if (state.division.status !== 'locked' && state.division.status !== 'published') {
        return failure('INVALID_TRANSITION', 'print_pack.pdf requires a locked or published division');
      }
      state.printPackRequests.push({
        fileName: 'print_pack.pdf',
        divisionId: state.division.divisionId,
        requestedBy: action.actorId,
        requestedAt: action.occurredAt,
      });
      appendAudit(state, action, {
        type: state.division.status === 'published' ? 'post_publish_changed' : 'post_lock_changed',
        reason: 'print_pack.pdf generation requested',
        stateAtEvent: state.division.status,
      });
      return success(state);
  }
}

function mergeDivision(
  state: PoolKoAdminState,
  action: Extract<PoolKoAdminAction, { type: 'mergeDivision' }>,
): AdminResult<PoolKoAdminState> {
  if (state.division.status !== 'draft' && state.division.status !== 'generated') {
    return failure('INVALID_TRANSITION', 'Division merges must be resolved before review and lock');
  }
  if (!action.reason.trim()) return failure('REASON_REQUIRED', 'A merge reason is required');
  const existingIds = new Set(state.entrants.map(({ entrantId }) => entrantId));
  if (action.entrants.some(({ entrantId }) => existingIds.has(entrantId))) {
    return failure('INVALID_INPUT', 'Merged entrant ids must be unique');
  }
  state.entrants.push(...action.entrants.map((entrant) => ({
    ...entrant,
    originalDivisionId: action.sourceDivisionId,
    mergedIntoDivisionId: state.division.divisionId,
  })));
  appendAudit(state, action, {
    type: 'pool_assignment_adjusted',
    reason: action.reason,
    originalDivisionId: action.sourceDivisionId,
    mergedIntoDivisionId: state.division.divisionId,
  });
  return success(state);
}

function generatePools(
  state: PoolKoAdminState,
  action: Extract<PoolKoAdminAction, { type: 'generatePools' }>,
): AdminResult<PoolKoAdminState> {
  if (state.division.lockState.isLocked || state.division.publishState.isPublished) {
    return failure('INVALID_TRANSITION', 'Locked or published pools cannot be regenerated');
  }
  appendAudit(state, action, { type: 'generation_requested' });
  const assignment = assignPools({
    divisionId: state.division.divisionId,
    entrants: state.entrants,
  });
  if (!assignment.ok) return failure('INVALID_INPUT', assignment.error.message);

  const matches: PoolKoMatch[] = [];
  state.pools = assignment.pools.map((pool) => {
    const roundRobin = generateRoundRobin({
      divisionId: state.division.divisionId,
      poolId: pool.poolId,
      entrantIds: pool.entrantIds,
    });
    if (!roundRobin.ok) return pool;
    matches.push(...roundRobin.matches);
    return { ...pool, roundRobinMatchIds: roundRobin.matches.map(({ matchId }) => matchId) };
  });
  state.matches = matches;
  state.standings = [];
  state.koBracket = undefined;
  state.division = { ...state.division, status: 'generated' };
  appendAudit(state, action, { type: 'generation_completed' });
  return success(state);
}

function reorderPoolEntrant(
  state: PoolKoAdminState,
  action: Extract<PoolKoAdminAction, { type: 'reorderPoolEntrant' }>,
): AdminResult<PoolKoAdminState> {
  if ((state.division.status === 'locked' || state.division.status === 'published') && !action.reason?.trim()) {
    return failure('REASON_REQUIRED', 'Post-lock changes require a reason');
  }
  if (!action.reason?.trim()) return failure('REASON_REQUIRED', 'Pool adjustments require a reason');
  const fromPool = state.pools.find(({ entrantIds }) => entrantIds.includes(action.entrantId));
  const toPool = state.pools.find(({ poolId }) => poolId === action.toPoolId);
  if (!fromPool || !toPool) return failure('INVALID_INPUT', 'Pool or entrant was not found');
  if (action.swapWithEntrantId) {
    const swapIndex = toPool.entrantIds.indexOf(action.swapWithEntrantId);
    const entrantIndex = fromPool.entrantIds.indexOf(action.entrantId);
    if (swapIndex < 0 || entrantIndex < 0) return failure('INVALID_INPUT', 'Swap entrant was not found');
    fromPool.entrantIds[entrantIndex] = action.swapWithEntrantId;
    toPool.entrantIds[swapIndex] = action.entrantId;
  } else if (fromPool.poolId !== toPool.poolId) {
    if (toPool.entrantIds.length >= 5 || fromPool.entrantIds.length <= 3) {
      return failure('INVALID_INPUT', 'Pool adjustments must preserve 3 to 5 entrants');
    }
    fromPool.entrantIds = fromPool.entrantIds.filter((entrantId) => entrantId !== action.entrantId);
    toPool.entrantIds.push(action.entrantId);
  }
  appendAudit(state, action, {
    type: state.division.status === 'published'
      ? 'post_publish_changed'
      : state.division.status === 'locked'
        ? 'post_lock_changed'
        : 'pool_assignment_adjusted',
    reason: action.reason,
    ...(state.division.status === 'locked' || state.division.status === 'published'
      ? { stateAtEvent: state.division.status }
      : {}),
  });
  return success(state);
}

function recordScore(
  state: PoolKoAdminState,
  action: Extract<PoolKoAdminAction, { type: 'recordScore' }>,
): AdminResult<PoolKoAdminState> {
  const matchIndex = state.matches.findIndex(({ matchId }) => matchId === action.matchId);
  if (matchIndex < 0 || action.games.length === 0) {
    return failure('INVALID_INPUT', 'A known match and at least one game are required');
  }
  const wasScheduled = state.matches[matchIndex].scoreState === 'scheduled';
  state.matches[matchIndex] = {
    ...state.matches[matchIndex],
    scoreState: 'completed',
    games: action.games.map((game) => ({ ...game })),
    updatedByAuditEventId: auditId(action, wasScheduled ? 'score-entered' : 'score-updated'),
  };
  state.scoreReviewComplete = false;
  appendAudit(state, action, { type: wasScheduled ? 'score_entered' : 'score_updated' });
  return success(state);
}

function resolvePublicDraw(
  state: PoolKoAdminState,
  action: Extract<PoolKoAdminAction, { type: 'resolvePublicDraw' }>,
): AdminResult<PoolKoAdminState> {
  if (state.division.status !== 'locked') {
    return failure('INVALID_TRANSITION', 'Public draws can be resolved only after pools are locked');
  }
  const draw = publicDrawResolutionSchema.safeParse(action.publicDraw);
  if (!draw.success || draw.data.operatorId !== action.actorId || draw.data.resolvedAt !== action.occurredAt) {
    return failure('INVALID_INPUT', 'Public draw must include matching operator audit metadata');
  }
  const pool = state.pools.find(({ poolId }) => poolId === action.poolId);
  if (!pool) return failure('INVALID_INPUT', 'Pool was not found');
  const unresolved = rankPool({
    poolId: pool.poolId,
    entrantIds: pool.entrantIds,
    matches: state.matches,
    headToHeadRule: 'only_two_way',
    publicDraws: state.publicDraws,
  });
  if (
    unresolved.ok
    || unresolved.error.code !== 'PUBLIC_DRAW_REQUIRED'
    || !sameIds(unresolved.error.candidateEntrantIds, draw.data.candidateEntrantIds)
  ) {
    return failure('INVALID_TRANSITION', 'Public draw is allowed only after deterministic tie breakers');
  }
  appendAudit(state, action, { type: 'public_draw_created' });
  const ranked = rankPool({
    poolId: pool.poolId,
    entrantIds: pool.entrantIds,
    matches: state.matches,
    headToHeadRule: 'only_two_way',
    publicDraws: [...state.publicDraws, draw.data],
  });
  if (!ranked.ok) return failure('INVALID_INPUT', ranked.error.message);
  state.publicDraws.push(draw.data);
  state.standings = [
    ...state.standings.filter((standing) => standing.poolId !== pool.poolId),
    ...ranked.standings,
  ];
  appendAudit(state, action, { type: 'public_draw_resolved', publicDraw: draw.data });
  return success(state);
}

function deriveStandings(
  state: PoolKoAdminState,
): { ok: true; standings: PoolStanding[] } | { ok: false; error: PoolKoAdminError } {
  const standings: PoolStanding[] = [];
  for (const pool of state.pools) {
    const ranked = rankPool({
      poolId: pool.poolId,
      entrantIds: pool.entrantIds,
      matches: state.matches,
      headToHeadRule: 'only_two_way',
      publicDraws: state.publicDraws,
    });
    if (!ranked.ok) {
      return failure(
        'INVALID_TRANSITION',
        ranked.error.code === 'PUBLIC_DRAW_REQUIRED'
          ? `Public draw required: ${ranked.error.candidateEntrantIds.join(', ')}`
          : ranked.error.message,
      );
    }
    standings.push(...ranked.standings);
  }
  return { ok: true, standings };
}

function previewKo(
  state: PoolKoAdminState,
  _action: Extract<PoolKoAdminAction, { type: 'previewKo' }>,
): AdminResult<PoolKoAdminState> {
  if (state.division.status !== 'locked' || !state.scoreReviewComplete) {
    return failure('INVALID_TRANSITION', 'KO preview requires locked pools and completed score review');
  }
  if (state.standings.length === 0) return failure('INVALID_TRANSITION', 'Derived standings are required');
  const qualifierResult = mapQualifiersToKo({
    pools: state.pools.map((pool) => ({
      poolId: pool.poolId,
      standings: state.standings.filter(({ poolId }) => poolId === pool.poolId),
    })),
    kPerPool: state.division.kPerPool.value,
  });
  if (!qualifierResult.ok) return failure('INVALID_INPUT', qualifierResult.error.message);
  const bracketResult = generateKoBracket({
    divisionId: state.division.divisionId,
    qualifiers: qualifierResult.qualifiers,
  });
  if (!bracketResult.ok) return failure('INVALID_INPUT', bracketResult.error.message);
  state.koBracket = bracketResult.bracket;
  return success(state);
}

function reorderKoSlots(
  state: PoolKoAdminState,
  action: Extract<PoolKoAdminAction, { type: 'reorderKoSlots' }>,
): AdminResult<PoolKoAdminState> {
  if ((state.division.status === 'locked' || state.division.status === 'published') && !action.reason?.trim()) {
    return failure('REASON_REQUIRED', 'Post-lock changes require a reason');
  }
  if (!action.reason?.trim()) return failure('REASON_REQUIRED', 'KO slot adjustments require a reason');
  const slots = state.koBracket?.rounds.flatMap(({ matches }) => matches.flatMap(({ slots }) => slots));
  const first = slots?.find(({ slotId }) => slotId === action.firstSlotId);
  const second = slots?.find(({ slotId }) => slotId === action.secondSlotId);
  if (!first || !second) return failure('INVALID_INPUT', 'KO slots were not found');
  const firstValue = { ...first };
  Object.assign(first, second, { slotId: firstValue.slotId });
  Object.assign(second, firstValue, { slotId: second.slotId });
  appendAudit(state, action, {
    type: state.division.status === 'published'
      ? 'post_publish_changed'
      : state.division.status === 'locked'
        ? 'post_lock_changed'
        : 'ko_slot_adjusted',
    reason: action.reason,
    ...(state.division.status === 'locked' || state.division.status === 'published'
      ? { stateAtEvent: state.division.status }
      : {}),
  });
  return success(state);
}

function appendAudit(
  state: PoolKoAdminState,
  actor: AdminActor,
  event: Record<string, unknown> & { type: PoolKoAuditEvent['type'] },
) {
  const parsed = poolKoAuditEventSchema.parse({
    auditEventId: auditId(actor, event.type),
    divisionId: state.division.divisionId,
    actorId: actor.actorId,
    occurredAt: actor.occurredAt,
    ...event,
  });
  state.auditEvents.push(parsed);
}

function auditId(actor: AdminActor, suffix: string) {
  return `${actor.actorId}-${actor.occurredAt}-${suffix}`;
}

function sameIds(left: string[], right: string[]) {
  return [...left].sort().join('|') === [...right].sort().join('|');
}

function isOperatorAction(action: PoolKoAdminAction) {
  return action.type !== 'recordScore';
}

function isCourtStaffAction(action: PoolKoAdminAction) {
  return action.type === 'recordScore';
}

function success(state: PoolKoAdminState): AdminResult<PoolKoAdminState> {
  return { ok: true, state };
}

function failure(code: PoolKoAdminError['code'], message: string): { ok: false; error: PoolKoAdminError } {
  return { ok: false, error: { code, message } };
}

function cloneState(state: PoolKoAdminState): PoolKoAdminState {
  return {
    division: structuredClone(state.division),
    entrants: state.entrants.map((entrant) => ({ ...entrant })),
    pools: state.pools.map(clonePool),
    matches: state.matches.map(cloneMatch),
    standings: structuredClone(state.standings),
    ...(state.koBracket ? { koBracket: structuredClone(state.koBracket) } : {}),
    publicDraws: structuredClone(state.publicDraws),
    auditEvents: structuredClone(state.auditEvents),
    scoreReviewComplete: state.scoreReviewComplete,
    printPackRequests: structuredClone(state.printPackRequests),
  };
}

function clonePool(pool: Pool): Pool {
  return {
    ...pool,
    entrantIds: [...pool.entrantIds],
    roundRobinMatchIds: [...pool.roundRobinMatchIds],
    ...(pool.manualAdjustment ? { manualAdjustment: { ...pool.manualAdjustment } } : {}),
  };
}

function cloneMatch(match: PoolKoMatch): PoolKoMatch {
  return structuredClone(match);
}

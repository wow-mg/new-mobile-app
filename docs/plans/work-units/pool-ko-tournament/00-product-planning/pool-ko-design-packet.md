# POOL+KO Tournament Design Packet

- Work unit: `pool-ko-tournament`
- Owner role: Product/Planning
- Source: room-986 operator decisions, 2026-07-28 15:01 KST, captured in Workboard `e283defc-d297-4ed1-8207-99d3e96bbd55`
- Downstream first implementation card: Workboard `e8f59168-0d89-46fb-9012-d9a38d102b27`
- Status: READY_FOR_EXECUTION for Backend/API pure engine + schema/contract packet

## 1. Scope

Create deterministic POOL+KO tournament generation and publication support for PickleHub divisions.

Backend/API owns the first executable slice:

1. Shared contracts and DTOs for POOL+KO division config, generated pools, standings, KO bracket slots, score-derived results, lock/publish state, audit events, and permissions.
2. Pure deterministic engine functions for pool assignment, round-robin generation, standings ranking, qualifier mapping, KO bracket generation, and withdrawal/default handling.
3. Contract/unit test evidence that downstream Admin UI and Participant App can consume stable DTOs without guessing.

Admin UI and Participant App implementation must wait for the accepted Backend/API contract packet or stable DTO stub from this slice.

## 2. Non-goals

- No provider console action.
- No live-money action.
- No production deploy or release action.
- No direct standings mutation UI or API.
- No DUPR-based final tie break after configured game/point tie breakers are exhausted.
- No hardcoded DUPR or age bands in engine logic. Bands are admin tournament templates/config inputs.
- No automatic cancellation for N<3 divisions. Admin decision is required.

## 3. Frozen tournament rules

### 3.1 Qualifier count

- Default KO qualifier count per pool is `K=2`.
- `K` must be configurable per division.
- Backend contracts must expose the effective K value and whether it is defaulted or explicitly overridden.

### 3.2 Pool match format

- Default pool stage match format: one game to 15, win by 2.
- Scoring format must be division-configurable.
- Pool standings are derived from recorded scores/events only.

### 3.3 KO match format

- Default KO stage format: best-of-3 games to 11.
- KO scoring format must be division-configurable.
- A 3-game match default/forfeit result is represented as match score 2-0 with 11-0 game scores.

### 3.4 Forfeit/default scoring

- Forfeit/default game score is 11-0 per game.
- Pool one-game default is 11-0.
- KO best-of-3 default is 2-0 with 11-0 game scores.
- Defaulted results must carry reason/audit metadata, not only numeric scores.

### 3.5 Tie resolution

Ranking order must be deterministic until the final unresolved tie:

1. Match wins.
2. Game differential.
3. Point differential.
4. Configured head-to-head rule where applicable.
5. Public draw when still unresolved.

Public draw is allowed only after deterministic tie breakers are exhausted. It must be auditable with draw id, candidate team ids, operator id, timestamp, and result. Do not use DUPR as the final tie breaker.

### 3.6 Withdrawal behavior

- Mid-pool withdrawal preserves played matches.
- Remaining pool matches become forfeits/defaults against the withdrawn team.
- A division-level rule option may invalidate all withdrawn-team matches if less than half of that team's scheduled pool matches were played.
- Post-publication withdrawal becomes a KO bye/no-opponent slot.
- Post-publication withdrawal must not reseed the bracket.

### 3.7 Same-pool rematch avoidance

- Same-pool rematch avoidance in KO is best-effort.
- Prioritize seed correctness over club spread.
- Place same-pool rematches as late as possible when the bracket size and qualifier distribution allow it.
- If unavoidable, preserve deterministic mapping and record `rematch_avoidance_status` in the bracket metadata.

### 3.8 Group sizing

Pool sizing preference:

1. Prefer 3- and 4-team pools.
2. Use 5-team pools only to avoid 2-team pools.
3. Never auto-create 2-team pools.
4. N<3 requires explicit admin decision.

Required examples:

| Entrants | Expected pool sizing |
| --- | --- |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 3+3 |
| 7 | 4+3 |
| 8 | 4+4 |
| 9 | 3+3+3 |
| 10 | 4+3+3 |
| 11 | 4+4+3 |
| 12 | 4+4+4 |
| 13 | 4+3+3+3 |
| 14 | 4+4+3+3 |
| 15 | 4+4+4+3 |
| 16 | 4+4+4+4 |

Backend tests must cover N=3..64, not only the example rows.

### 3.9 Division merge lineage

- Preserve each entry's original division.
- Record `merged_into_division_id` when divisions are merged.
- Merge lineage must be visible to Admin UI and included in audit/event records.

### 3.10 Lock and publish gates

- Admin can preview and manually adjust pool assignments before lock.
- Admin can drag-edit pool assignment and KO slots only.
- Admin cannot directly edit standings.
- `review_complete` is required before lock.
- Publish is allowed only from locked state.
- Post-lock or post-publish changes require a reason and audit event.

### 3.11 Roles and permissions

- Operator can generate, review, lock, publish, resolve public draws, and make post-lock changes with reasons.
- Court staff can enter scores only.
- Participant app is read-only and must not expose admin mutations.

### 3.12 Print/offline outputs

- A3 bracket PDF is required.
- `print_pack.pdf` is the official offline fallback.
- CSV is acceptable for check-in, court assignment, and awards MVP.
- Score sheets and personal schedules remain PDF outputs.

## 4. Backend/API contract packet requirements

Backend/API must produce a stable contract packet or DTO stub that includes:

### 4.1 Division configuration/status

- `division_id`
- `format`: `POOL_KO`
- `status`: draft, generated, review_complete, locked, published, archived/cancelled if applicable
- `k_per_pool`
- `pool_scoring_config`
- `ko_scoring_config`
- `withdrawal_rule`
- `public_draw_policy`
- `lock_state`
- `publish_state`

### 4.2 Entrants and merge lineage

- Entry/team identity.
- Seed.
- Club/team metadata needed for soft spread.
- Original division id.
- Merged-into division id.
- Withdrawal/default state.

### 4.3 Pool/group model

- Pool id/label.
- Assigned entry ids.
- Pool order.
- Round-robin match ids.
- Manual adjustment audit metadata.

### 4.4 Match/stage/slot model

- Stage: pool or KO.
- Round.
- Match id.
- Slot ids.
- Entrant/team ids or TBD/byes.
- Source mapping, such as `pool A rank 1`.
- Score state.
- Default/forfeit state.
- Audit metadata.

### 4.5 Standings model

- Derived rank.
- Wins/losses.
- Game differential.
- Point differential.
- Head-to-head metadata where applicable.
- Tie status.
- Public draw reference when used.

### 4.6 Audit events

- Generation requested/completed.
- Manual pool or KO slot adjustment.
- Review complete.
- Lock.
- Publish.
- Score entered/updated.
- Public draw created/resolved.
- Withdrawal/default applied.
- Post-lock/post-publish change reason.

### 4.7 Permissions

- Operator actions.
- Court staff score-entry actions.
- Participant read-only access.

## 5. Pure engine function requirements

Backend/API must implement or stub these pure functions first:

```ts
assignPools(input): PoolAssignmentResult
rankPool(input): PoolStanding[]
mapQualifiersToKo(input): KoSlotMappingResult
generateRoundRobin(input): PoolMatch[]
generateKoBracket(input): KoBracket
applyWithdrawal(input): WithdrawalResult
```

Function requirements:

- No database access inside pure functions.
- Deterministic output for identical input, except public draw resolution which must be explicit input/audit, not hidden randomness.
- Return validation errors instead of silently generating invalid pools for N<3 or impossible states.
- Preserve input ids in outputs for auditability.

## 6. Backend/API acceptance criteria

Done when:

- Shared DTO/contracts are created or updated for POOL+KO.
- Pure engine functions exist with unit tests.
- Tests cover N=3..64 group sizing.
- Tie/public draw behavior is tested.
- Withdrawal behavior is tested.
- No direct standings mutation path exists in contracts.
- Contract tests or DTO fixture snapshots exist for Admin UI and Participant App consumption.
- Mobile Architect review is requested or recorded as not yet available with reason.
- No production/live/provider/deploy action is performed.

## 7. Admin UI downstream acceptance seed

Admin UI can start after Backend/API stable DTO stub or accepted contract packet exists. Admin UI scope:

- Batch division generation from event x DUPR band x age band.
- N<3 admin decision UI.
- Merge lineage display.
- Pool preview and drag edit.
- Lock pools.
- Score review.
- Public draw resolution.
- KO preview and slot drag.
- Publish from locked state only.
- Post-lock change reason.
- `print_pack.pdf` generation trigger.
- Operator/court-staff permission checks.
- Audit log evidence.

## 8. Participant App downstream acceptance seed

Participant App can start after Backend/API stable DTO stub or accepted contract packet exists. Participant scope:

- Published read-only POOL+KO views.
- Division list.
- Derived pool standings.
- KO bracket view.
- Personal schedule.
- Withdrawal/bye display.
- Print/PDF links if applicable.
- Snapshot tests for pool/KO states, bye/withdrawal rendering, personal schedule rendering, and route compatibility.

## 9. Human gates and safety

The following remain closed unless separately approved with evidence:

- Production release/deploy.
- Provider console changes.
- Live money movement.
- Failed required gate risk acceptance.
- Secret-bearing configuration or credential changes.

## 10. Execution readiness decision

Product/Planning decision: Backend/API pure engine + schema/contract packet is READY_FOR_EXECUTION using this artifact as the source of truth.

Next responsible role: Backend/API Integrator with Mobile Architect review.

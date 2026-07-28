# 4C Mobile CS/Legal/Status Implementation Plan

- Work unit: `2a2e3137-ae2a-455d-86d5-b396ff44d483`
- Owner: Mobile App Dev
- Routing: `.evidence/room986-admin-ops-cs-readiness-20260723-1812/codex-role-workflow-routing.json`
- Evidence: `.evidence/room986-admin-ops-cs-readiness-20260723-1812/`

## Scope and source decisions

This is the Room 986-approved dev/staging-only 4C slice. The target is the
existing customer support, terms, privacy, application, payment, refund, and
navigation surfaces in `apps/mobile/src/app/{support,terms,privacy-policy,index}.tsx`
and narrow tests in `apps/mobile/src/app/__tests__/home.test.tsx`.

Sources of truth: root `AGENTS.md`; `PROJECT_ENVIRONMENT.md`;
`.agents/skills/wm/SKILL.md`; `.agents/skills/mobile-app-dev-workflow/SKILL.md`;
`.agents/skills/mobile-app-dev-workflow/references/sot.md`;
`mobile-app-dev-team/runtime-sources/role-souls/mobile-app-dev-soul.md`;
`mobile-app-dev-team/governance/gates-and-evidence.md`; and the routing artifact
above.

The existing screen structure is the selected design option. This is a
copy/navigation-only readiness clarification, so no new visual design is
introduced. The explicit design gap is the absence of a separate Design
handoff for 4C; implementation must reuse existing `PageHero`, `InfoCard`,
`ActionButton`, semantic styles, and route layout without visual invention.

## State and contract packet

- Routes/screens: support, terms, privacy policy, my page/reservation/payment
  status surfaces.
- State owner: existing participant flow in `index.tsx`.
- Five-state matrix: default retains clarified readiness copy and navigation;
  loading/error continue through existing `RouteStatusNotice`; empty continues
  through existing empty application/payment/inquiry copy; permission-denied is
  not applicable because these public/static or participant-shell screens add
  no permission boundary.
- API contract: no request, response, schema, mock, or fixture change. Existing
  participant contracts remain untouched. Contract reviewer must confirm N/A.
- Architecture: no new route, dependency, shared state, runtime, or API
  boundary.
- Stable selectors: add only narrow kebab-case selectors where needed for
  durable readiness assertions; preserve existing selectors.

## Tests-first and checkpoints

1. Add failing Jest assertions proving: legal/privacy are visibly draft and not
   published; support identifies dev/staging and operator handling; application,
   payment, and refund language does not imply live payment/refund completion;
   customer navigation reaches support, terms, privacy, and status surfaces.
2. Run the targeted home test. Capture output under the Room 986 evidence path.
3. Checkpoint 1 review input: this plan, tests-only diff, targeted output,
   evidence path, and remaining implementation impact. Required read-only
   reviewers: `wm-implementation-reviewer` and `wm-contract-reviewer`.
4. Implement the smallest existing-component copy/navigation change.
5. Run targeted mobile Jest, mobile lint, and applicable workspace validation.
6. Checkpoint 2/final review input: approved plan, complete scoped diff, command
   output, evidence path, and residual external/human gates. Both required
   reviewers must produce read-only verdict evidence before Done.

## Non-goals and gates

No backend/API/payment implementation, live provider/OAuth calls, dependency
change, deployment, PR/push/merge, production/release action, legal/privacy
publication, secret/env access, or external readiness claim. Draft legal copy
stays explicitly unpublished. Payment/refund/application status stays
operator-managed and repo-local; no live readiness is claimed.

Existing unrelated and overlapping worktree edits must be preserved. Completion
requires scoped `git diff`, full `git status --short`, command evidence, both
reviewer results, and explicit residual human/external gates.

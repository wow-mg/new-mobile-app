# codex-role-workflow/v1

status: ready
resolved_role: Product/Planning
entry_case: modification_request / direct_implementation_language
request_source: Room 986, 조원영, 2026-07-21 15:36 KST
workboard_card: 82a20cff-2c17-4e65-b090-f992059d5316

## Request
프론트 개인정보처리방침 링크를 확인하고, 개인정보처리방침 내 회원가입 수집 목적의 수집 항목에 카카오 권한 신청 대상인 성별, 연령대, 생일, 출생 연도를 추가한다. 각 항목은 필수/선택 조건을 명시해야 한다.

## Scope
- Locate the frontend privacy policy route/link.
- Update the frontend privacy policy text only.
- Add the following personal information items under the membership/signup collection purpose: 성별, 연령대, 생일, 출생 연도.
- Mark the added fields as optional unless an existing approved product/account flow requires them as mandatory.
- Preserve existing draft/legal caveats and avoid unrelated terms/content changes.

## Non-goals
- No external Kakao permission application submission.
- No production deploy, release, or store submission.
- No final legal approval claim.
- No backend/API schema or data collection implementation unless explicitly required by the current code to keep the policy consistent.

## Human gates
- Legal/privacy final approval remains human-owned.
- This artifact authorizes only a draft text/code update for review, not legal approval or external submission.

## Downstream implementation routing
codex_interactive_required: true
codex_execution_contract: /workspace/skills/codex-interactive-repo-work/SKILL.md
allowed_repo_local_skill: mobile-app-dev-workflow
required_reviewers: wm-implementation-reviewer, po-planning-reviewer
primary_owner_for_implementation: Mobile App Dev
primary_owner_for_scope/readiness: Product/Planning
process_sot:
- /workspace/skills/codex-role-workflow/SKILL.md
- /workspace/skills/codex-interactive-repo-work/SKILL.md
- /workspace/WORKFLOW.md

## Evidence expectation
- Changed file paths.
- Diff summary showing the four added items and 필수/선택 condition.
- Verification command output for the narrow relevant test or grep evidence.
- git status --short.

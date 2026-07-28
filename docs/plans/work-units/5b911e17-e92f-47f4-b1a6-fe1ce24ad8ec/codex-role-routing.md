schema: codex-role-workflow/v1
status: ready
resolved_role: Backend/API Integrator
role_identity_source: Workboard card 5b911e17-e92f-47f4-b1a6-fe1ce24ad8ec assigned backend/API implementation; /workspace/IDENTITY currently product-planning but card comment authorizes main+scoped Codex substitution for unconfigured backend-api-integrator.
entry_case: contract_or_backend
routing_reason: accepted Workboard implementation packet for refund/cancel/admin backend handling under service-open payment/refund stream.
process_sot: mobile-app-dev-team/runtime-sources/workflows/entry-case-routing.md
allowed_repo_local_codex_skills:
  - mobile-backend-api-integrator-workflow
required_reviewers:
  - wm-contract-reviewer
  - wm-implementation-reviewer
durable_artifact_stage: 03-contract-api
readiness_state_or_required_gate: READY_FOR_EXECUTION via Workboard parent 33d78482 and card 5b911e17 acceptance criteria; real refunds/provider proof remain human-gated.
human_gate_or_external_proof_blocker: Real refunds and provider proof require explicit human approval; implementation must use mocked provider client only.
codex_interactive_required: true
codex_execution_contract: /workspace/skills/codex-interactive-repo-work/SKILL.md
next_action: Run scoped Codex PTY from managed repo root, invoke $wm, implement tests-first refund/cancel/admin backend scope only, then validate and run required reviewers.
secret_safety_statement: Do not expose or require credentials, tokens, or live provider secrets.
external_proof_boundary: Repo-local tests and mocks do not prove live provider refund execution or external payment/refund settlement.

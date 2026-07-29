# Final actual-work review prompt

Act as `wm-implementation-reviewer` in read-only final mode. Do not edit,
delegate, deploy, call providers/databases, or expose secrets.

Review only the two Medium findings in:

- `.evidence/wm/fd9371d0-841c-4a34-aa27-9a41b5ad4ffb/checkpoint-review.md`

Against:

- the full current scoped working-tree diff;
- the approved API and mobile implementation plans under this work unit;
- `.evidence/wm/fd9371d0-841c-4a34-aa27-9a41b5ad4ffb/no-go-remediation.md`;
- current app/API tests and implementation.

Required acceptance:

1. The mobile applicationBridgeOnly submit/confirm path calls exactly POST
   application, GET owned application, and GET mypage. Explicit payment status
   refresh calls exactly GET mypage. It does not call `/api/payments/*` or
   participant support, notifications, or games.
2. Participant dev-session access is method/path limited to GET/PATCH profile,
   POST application, GET owned application, and GET mypage. DELETE application
   and participant support/notifications/games are not allowlisted.
3. Creation overrides a forged participant ID and application reads are
   ownership-bound with foreign reads returning 404.
4. Review the recorded PASS results: API focused Vitest 3 files/21 tests,
   mobile focused Jest 1 suite/39 tests, API and mobile lint (`tsc --noEmit`),
   and `git diff --check`.

Return findings first and exactly one valid final JSON envelope. A GO is limited
to these findings and does not authorize commit, PR, push, merge, deployment,
provider/PG/database calls, money movement, or the Room 986 pre-deploy gate.

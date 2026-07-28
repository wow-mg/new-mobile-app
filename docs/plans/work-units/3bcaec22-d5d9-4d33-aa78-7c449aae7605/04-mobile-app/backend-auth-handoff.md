# Backend/API Integrator Handoff — Payment/Refund Mobile Auth

Work unit: `3bcaec22-d5d9-4d33-aa78-7c449aae7605`

Requested owner: Backend/API Integrator

## Blocker

The participant payment/refund routes compare `Authorization` to the
server-private `PARTICIPANT_PREVIEW_BEARER_TOKEN` in
`apps/api/src/routes/payments.ts`. The mobile participant client currently reads
`EXPO_PUBLIC_PARTICIPANT_API_BEARER_TOKEN`, but `PROJECT_ENVIRONMENT.md`
explicitly forbids bearer credentials in compiled `EXPO_PUBLIC_*` values.

Mobile App Dev cannot safely wire payment/refund calls until the API accepts a
mobile-held authenticated session credential or another approved secret-safe
authorization contract. The existing Kakao dev session returns an access token,
but the payment route does not currently accept or resolve that session token.
This handoff does not authorize Mobile App Dev to change backend auth.

## Done when

- Define and implement, under Backend/API Integrator ownership, the
  participant payment/refund authentication and participant-identity resolution
  contract that a mobile client can safely use.
- Keep identity server-owned; do not accept participant identity from payment or
  refund request JSON.
- Keep preview/server bearer secrets out of `EXPO_PUBLIC_*`, committed files,
  logs, fixtures, and API responses.
- Define failure mapping through the existing contract-owned
  `PAYMENT_FORBIDDEN` behavior or an explicitly reviewed shared-contract update.
- Provide focused backend tests and a durable `03-contract-api` handoff that
  Mobile App Dev and `wm-contract-reviewer` can verify.
- Preserve the sandbox/no-live-provider boundary.

## Mobile follow-up

After the handoff, rerun both required Workboard 3E plan reviews. Only dual GO
permits tests-first mobile implementation. The mobile plan additionally requires
one idempotency key per logical order attempt, reuse after unknown outcomes, no
automatic create-order retry, and a new key only for an explicitly new attempt
after a terminal failure.


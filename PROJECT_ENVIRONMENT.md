# Project Environment

Last updated: 2026-07-12

This file is the root source for the current project environment and runtime settings. Keep it in sync when changing package versions, Expo config, NativeWind config, Codex runtime files, CI gates, EAS workflows, required environment variables, or the Codex MCP/CLI setup guide at `docs/CODEX_MCP_ENVIRONMENT.md`.

## Workspace

- Package manager: `pnpm@9.15.9` from root `package.json`.
- Workspace packages: `apps/*` and `packages/*` from `pnpm-workspace.yaml`.
- Turbo tasks: `build`, `lint`, and `test` from `turbo.json`; `test` depends
  on upstream `^build` so clean CI builds workspace package runtime exports
  before dependent package tests run.
- Required root gates:
  - `pnpm run test:runtime`
  - `pnpm turbo run lint test`
  - `pnpm run test:local-harness` for Codex runtime changes.
  - `pnpm run validate:work-unit-next` is composed into `test:runtime` for the work-unit next-action resolver.
  - `pnpm run validate:project-environment` is composed into `test:runtime` for offline SoT drift detection.
  - `pnpm run validate:evidence-hygiene` is composed into `test:runtime` for durable evidence path and secret hygiene.
  - `pnpm run validate:codex-run` is composed into `test:runtime` for the minimal Codex PTY launch-gate wrapper smoke fixtures.

## Mobile Runtime

- App path: `apps/mobile`.
- Framework: Expo SDK 56 with Expo Router.
- Runtime versions:
  - `expo`: `~56.0.15`
  - `react`: `19.2.3`
  - `react-dom`: `19.2.3`
  - `react-native`: `0.85.3`
  - `react-native-web`: `^0.21.2`
  - `expo-router`: `~56.2.14`
  - `expo-dev-client`: `~56.0.22`
  - `expo-doctor`: `^1.19.9` as the `doctor` script dependency.
  - `@playwright/test`: `^1.60.0` as the browser E2E test runner.
- Expo config: `apps/mobile/app.config.ts`.
  - Dynamic values come from environment variables.
  - Neutral template fallback values exist only so local config evaluation can run without customer values.
  - Preview, production, and EAS build config fail if app display name, slug, scheme, API URL, iOS bundle identifier, or Android package are missing.
  - Customer and production builds must override app display name, slug, scheme, iOS bundle identifier, Android package, and API URL through environment variables.
  - `newArchEnabled` is `true`.
  - Plugin is `expo-router`.
  - `extra.apiUrl` reads `EXPO_PUBLIC_API_URL`.
  - `extra.eas.projectId` reads `EAS_PROJECT_ID`.
- Mobile scripts:
  - `pnpm --filter mobile start`
  - `pnpm --filter mobile ios`
  - `pnpm --filter mobile android`
  - `pnpm --filter mobile run doctor`
  - `pnpm --filter mobile lint`
  - `pnpm --filter mobile test`
  - `pnpm --filter mobile e2e`
  - `pnpm --filter mobile e2e:web`
  - `pnpm --filter mobile web`
- Node baseline:
  - CI uses Node 22.
  - Mobile TypeScript uses `@types/node` 22.x so code cannot type-check against newer Node-only APIs by accident.

## Mobile Web E2E

- Browser E2E path: `apps/mobile/e2e-web`.
- Browser E2E config: `apps/mobile/playwright.config.ts`.
- Browser install command: `pnpm --filter mobile exec playwright install chromium`.
- Browser E2E command: `pnpm --filter mobile e2e:web`.
- Repo QA skill: `$e2e-test` plans, resets, executes, and records E2E evidence. It is a Codex skill, not the EAS build profile or workflow label named `e2e-test`.
- RN Web E2E validates only RN Web/browser-reproducible UI, navigation, state, and business logic flows.
- RN Web E2E does not validate native modules, OS permissions, native lifecycle behavior, push delivery, biometrics, camera, GPS, or other device/hardware features.
- Base RN Web E2E without an explicit API URL runs the browser UI/business-flow checks with a non-production loopback placeholder URL so local Expo Web can satisfy runtime URL validation. This does not prove deployed backend API reachability.
- RN Web deployed-backend E2E requires a deployed backend API URL through public client config:
  - `EXPO_PUBLIC_API_URL=<deployed-api-url> pnpm --filter mobile e2e:web`
  - `EXPO_PUBLIC_API_URL` is compiled into the client app and is not private; never put bearer tokens, signing keys, passwords, or private endpoints in it.
  - The current Railway QA API URL verified for this workspace is `https://api-production-3d74.up.railway.app`.
  - Evidence: `.evidence/e2e-test/20260609-233244-rn-web-railway-api/`.
- Playwright launches Expo Web with deterministic public test config plus the caller-provided backend API URL when present:
  - `EAS_BUILD=false`
  - `EXPO_PUBLIC_APP_ENV=development`
  - `EXPO_PUBLIC_APP_DISPLAY_NAME=Happickle`
  - `EXPO_PUBLIC_APP_SLUG=happickle-mobile`
  - `EXPO_PUBLIC_APP_SCHEME=happickle`
  - `EXPO_PUBLIC_API_URL` from the command environment, or `http://127.0.0.1:65535` as a local UI-only placeholder when no API URL is supplied
  - `EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER=com.template.mobile`
  - `EXPO_PUBLIC_ANDROID_PACKAGE=com.template.mobile`
- `EXPO_PUBLIC_*` values are public client configuration and must not contain tokens, bearer credentials, signing keys, passwords, or private service endpoints.
- Native completion remains separate:
  - Run Maestro and `mobile-mcp` visual QA when the required EAS account, simulator, emulator, or device is available.
  - If the user chooses direct local/manual native verification instead, record it as HUMAN-GATE evidence with residual risk; do not remove or mark the Maestro/mobile-mcp requirements as replaced.

## Mobile Native Evidence Ladder

- Strategy doc: `mobile-app-dev-team/runtime-sources/workflows/native-e2e-strategy.md`.
- Work-unit field: `status.json.evidence_ladder`.
- L0 `jest`: unit/component/contract/runtime checks.
- L1 `rn-web`: RN Web + Playwright for browser-reproducible flows only.
- L2 `eas-maestro`: EAS/Maestro native evidence.
- L3 `human-device`: linked device or `mobile-mcp` evidence plus human-gate residual risk.
- `scripts/validate-work-units.mjs` enforces `05-qa-release` `done` evidence levels.
- `scripts/ingest-eas-evidence.mjs --self-test` validates offline EAS/Maestro fixture ingestion and URL-query redaction. It does not call EAS, use tokens, run devices, or prove native readiness.

## Mobile Styling

- Styling layer: NativeWind with React Native primitives and semantic design tokens.
- Current NativeWind package: `nativewind@5.0.0-preview.4`.
- NativeWind v5 is a pre-release package, so this repo pins the exact preview version.
- NativeWind v5 rollback criteria:
  - Roll back to the last passing NativeWind v4 / Tailwind CSS v3 baseline if SDK 56 compatibility checks, Metro bundling, Jest, native run smoke, or Maestro/mobile visual QA fail because of NativeWind v5 and cannot be fixed in the same PR.
  - Do not promote a production release with unresolved NativeWind v5 rendering, bundling, or native runtime defects.
- Tailwind/PostCSS:
  - `tailwindcss`: `^4.3.0`
  - `@tailwindcss/postcss`: `^4.3.0`
  - `postcss`: `^8.5.15`
  - `lightningcss`: `1.30.1`
  - root pnpm override pins `lightningcss` to `1.30.1`.
  - PostCSS config: `apps/mobile/postcss.config.mjs`
- NativeWind dependencies:
  - `react-native-css`: `^3.0.7`
  - `react-native-reanimated`: `4.3.1`
  - `react-native-worklets`: `0.8.3`
  - `react-native-safe-area-context`: `~5.7.0`
- NativeWind config files:
  - `apps/mobile/babel.config.js` uses `babel-preset-expo` for runtime builds and adds `react-native-css/babel` only when `api.env('test')` is true so Jest can exercise className translation outside Metro.
  - `apps/mobile/metro.config.js` wraps Expo Metro with `withNativewind(config, { input: './global.css' })`.
  - `apps/mobile/global.css` imports Tailwind theme/preflight/utilities and `nativewind/theme`; semantic colors are defined with `@theme`.
  - `apps/mobile/nativewind-env.d.ts` references `react-native-css/types`.
  - `apps/mobile/jest.after-env.js` imports `react-native-css/jest` through Jest `setupFilesAfterEnv`.
  - `apps/mobile/src/app/_layout.tsx` imports `../../global.css`.
  - There is no active `tailwind.config.js`; Tailwind CSS v4 configuration is CSS-first.

## Mobile Environment Variables

Public JS runtime variables are parsed by `apps/mobile/env.ts`; app config variables are read directly by `apps/mobile/app.config.ts`.

`EXPO_PUBLIC_*` values are compiled into the client app and are not private. Use them only for public client configuration, never for tokens, passwords, bearer credentials, signing keys, or private service endpoints. Customer-specific and production values still must be injected through environment management instead of being hardcoded in the repo.

- Public JS runtime variables:
  - `EXPO_PUBLIC_APP_ENV`: `development`, `preview`, or `production`; default `development`.
  - `EXPO_PUBLIC_APP_DISPLAY_NAME`: optional in the runtime parser, default is `Happickle`; required explicitly by preview, production, and EAS build config.
  - `EXPO_PUBLIC_API_URL`: required URL.
- Public app config variables:
  - `EXPO_PUBLIC_APP_SLUG`: required by preview, production, and EAS build config.
  - `EXPO_PUBLIC_APP_SCHEME`: required by preview, production, and EAS build config; the dev API also uses the same value to allowlist Kakao callback deep-link returns.
  - `EXPO_PUBLIC_IOS_BUNDLE_IDENTIFIER`: required.
  - `EXPO_PUBLIC_ANDROID_PACKAGE`: required.
- Non-public variables:
  - `EAS_PROJECT_ID`: optional UUID.
  - `SERVICE_NATIVE_APP_KEY`, `SERVICE_REST_API_KEY`, and `SERVICE_JAVASCRIPT_KEY`: optional Kakao provider configuration inputs. `app.config.ts` exposes only key-presence booleans through `extra.socialLogin.kakao`; it never places these values in Expo extras. Presence does not mean live OAuth is ready.
Do not hardcode customer app names, bundle IDs, API URLs, tokens, or credentials.

## EAS And Maestro

- EAS config: `apps/mobile/eas.json`.
  - `development`: development client, internal distribution, `development` channel, `development` EAS environment.
  - `preview`: internal distribution, `preview` channel, `preview` EAS environment.
  - `production`: `production` channel with auto increment and `production` EAS environment.
  - `e2e-test`: Android APK and iOS simulator settings without credentials, using the `preview` EAS environment.
- The EAS profile/workflow label `e2e-test` is distinct from the repo Codex skill `$e2e-test`.
- EAS workflows:
  - `apps/mobile/.eas/workflows/build-and-submit.yml`: production build jobs use the `production` EAS environment and set `EXPO_PUBLIC_APP_ENV=production`.
  - `apps/mobile/.eas/workflows/e2e-test-android.yml`: E2E build job uses the `preview` EAS environment and sets `EXPO_PUBLIC_APP_ENV=preview`.
  - `apps/mobile/.eas/workflows/ota-update.yml`: preview update job uses the `preview` EAS environment and sets `EXPO_PUBLIC_APP_ENV=preview`.
- Maestro flows: `apps/mobile/.maestro`.
- Native E2E command: `pnpm --filter mobile e2e`.
- Current stable testIDs:
  - `home-title`
  - `counter-value`
  - `counter-increment-button`
- Prefer Maestro `id` selectors over visible text.

## API Runtime

- API path: `apps/api`.
- Stack: Hono, Drizzle ORM, postgres, zod.
- Scripts:
  - `pnpm --filter @template/api dev`
  - `pnpm --filter @template/api build`
  - `pnpm --filter @template/api lint`
  - `pnpm --filter @template/api test`
- Environment variables from `apps/api/src/env.ts`:
  - `DATABASE_URL`: required URL.
  - `API_PORT`: integer, default `3000`.
  - `API_BEARER_TOKEN`: required secret.
  - `PAYMENT_PROVIDER_ENV`: optional sandbox payment runtime selector; only
    `sandbox` or `dev-staging` is accepted.
  - `PAYMENT_PROVIDER_BASE_URL`: optional provider URL supplied through private
    runtime configuration.
  - `PAYMENT_PROVIDER_MERCHANT_ID`: optional private merchant identifier.
  - `PAYMENT_PROVIDER_SECRET`: optional private provider credential.
  - Payment provider values are secret-injected for sandbox/dev-staging only.
    They must not be exposed through `EXPO_PUBLIC_*`, logs, committed files, or
    API responses. Production payment configuration and live payment proof are
    outside the current repo-local scope.
- Import direction remains routes to services to db only.
- Shared API/domain schemas must come from `packages/contracts`.
- Current Railway QA deployment:
  - Project: `new-mobile-app`.
  - API service: `api`.
  - Postgres service: `Postgres`.
  - API URL: `https://api-production-3d74.up.railway.app`.
  - Latest verified API deployment id: `4c701f22-3ce9-40ef-a4bd-560252b773f3`.
  - `GET /livez` returns `{"status":"ok"}`.
  - `GET /readyz` returns `{"status":"ok"}`.
  - Railway runtime variables include `DATABASE_URL`, `API_BEARER_TOKEN`, `PORT=3000`, `API_PORT=3000`, `RAILWAY_DOCKERFILE_PATH=apps/api/Dockerfile`, and `RAILWAY_HEALTHCHECK_PATH=/readyz`.
  - Do not print or commit Railway secret values. `API_BEARER_TOKEN` was rotated after setup output exposed an earlier generated value.

## Contracts Package

- Package path: `packages/contracts`.
- Source entry: `./src/index.ts`.
- Peer dependency: `zod ^3.25.0 || ^4.0.0`.
- This package is the single source of truth for API request/response types and shared domain schemas.
- Runtime export: `./dist/index.js`, with TypeScript types sourced from `./src/index.ts`.
- Build command: `pnpm --filter @template/contracts build`.
- Test command: `pnpm --filter @template/contracts test`.
- API Docker builds must build `@template/contracts` before `@template/api` so deployed Node runtimes do not import TypeScript source from `node_modules`.

## Codex Runtime

- Installed Codex plugin marketplaces:
  - `expo-plugins`
    - source: `expo/skills`
    - ref: `main`
    - marketplace root: user-local Codex marketplace cache, not a repo-pinned path; do not commit a resolved absolute path.
- Installed Codex plugins:
  - `expo@expo-plugins`
    - version: `1.1.0`
    - status: installed and enabled
    - plugin root: user-local Codex plugin cache for `expo-plugins/expo/1.1.0`, not a repo-pinned path; do not commit a resolved absolute path.
    - use only for generic Expo, React Native, EAS, dev client, SDK upgrade, deployment, native UI, API route, and data fetching guidance.
    - repo skills remain authoritative for contracts, role boundaries, evidence, and QA gates.
- Repo skills: `.agents/skills/<skill-name>/SKILL.md`.
  - `$wm` plans must be SoT-grounded: material planning decisions cite or name verified SoT inputs, and missing or ambiguous SoT must be reported as unknown/blocked instead of being filled by predictions, assumptions, or expected behavior.
  - `$wm` material planning decisions that affect scope, role ownership, architecture/API/runtime contracts, evidence gates, human gates, or downstream handoff must route to the appropriate read-only planning, reviewer, researcher, or gate-advisor custom agent when practical. The result must record agent, question, conclusion, source refs or evidence path, and reflection/impact; if routing is not practical, the plan or evidence must record the skip reason.
  - `$wm` implementation runs must not proceed past planning until applicable local SoT has been read and cited or named in the plan.
  - `$wm` must not delegate implementation or fixes to a write-capable executor; write-capable executor delegation is forbidden. Execution remains in the current repo-scoped run after required read-only planning/review evidence exists.
  - `$wm` pre-implementation plan review evidence and final actual-work review evidence are mandatory for non-trivial implementation runs.
  - `$wm` approved implementation plans must define checkpoint boundaries before execution. `$wm` checkpoint review evidence must include the approved plan, checkpoint diff, command output, evidence path, remaining plan impact, and read-only reviewer verdict or source-backed skip reason; failed or blocked checkpoint review findings must be addressed before the next checkpoint proceeds.
  - `$wm` implementation runs require persisted read-only reviewer evidence for both the completed plan and the actual completed work, and final user reports must include material `git diff` change details.
  - The `$wm` headless helper is an allowed review evidence path; the review evidence requirement itself is mandatory.
  - `$e2e-test` is the repo QA skill for E2E test planning, tested-instance reset, planned execution, and objective evidence capture across RN Web Playwright, Maestro, `mobile-mcp`, or manual HUMAN-GATE checks. It records evidence under `.evidence/e2e-test/<YYYYMMDD-HHMMSS>-<slug>/` and does not implement fixes.
  - `$qa-railway-workflow` is the repo QA skill for Railway CLI install/login/project/service/database/variable/domain/deploy/status/log/health workflows, redacted Railway evidence, RN Web E2E API URL handoff, and `PROJECT_ENVIRONMENT.md` synchronization. It does not implement app, backend, contract, migration, or mobile UI fixes.
  - `$git-workflow` is the repo Git workflow skill for Codex agents that need branch preflight, scoped commit, PR, reviewer status, approval checks, issue handling, handoff, or completion flow. It preserves branch/PR workflow, forbids direct push to `main`, self-approval, failed-gate pass-through, unauthorized force-push, unauthorized issue mutation, and merge/delete branch during completion. It records local readiness only; live GitHub/Jira/Confluence/EAS/OpenClaw state remains external-platform proof.
  - Product/Planning repo-local Codex adapters use required `po-*` slugs:
    - `po-requirement-office-hours` maps source skill `mobile-requirement-office-hours` page `1374519364`.
    - `po-work-unit-planning-and-agent-sprint` maps source skill `mobile-work-unit-planning-and-agent-sprint` page `1374650456`.
    - `po-prd-to-execution` maps source skill `mobile-prd-to-execution` page `1373634562`.
    - `po-planning-completeness-review` maps source skill `mobile-planning-completeness-review` page `1374519387`.
    - These are Product/Planning operational adapters, not a standalone `mobile-product-planning-workflow` role wrapper.
  - Design repo-local Codex adapters use required `design-*` slugs:
    - `design-mobile-design-handoff` maps source skill `mobile-design-handoff` page `1373765661`, Design SOUL page `1373765702`, and Design Codex practice page `1374290207`.
    - `design-stitch-mcp-operating-rules` defines reusable Stitch MCP execution rules for Design handoff work and maps the same Design source/practice pages.
    - These adapters require objective UI/UX framing, DESIGN.md decision handling, Product/Planning P0 scope/evidence approval before Stitch generation, exactly two Stitch visual design directions, Product/Planning P1 scope/evidence approval before HTML extraction, Option A/B HTML extraction via `code.html` or Stitch MCP fetch only after P1, Option A/B image extraction via Stitch MCP, dated `design-pub-html/<YYYY-MM-DD>/` publication, five-state matrix, UX acceptance criteria, and evidence.
    - P0/P1 Product/Planning approvals are scope/evidence approvals for PRD fit, non-goals, evidence readiness, and human-gate routing. They are not Design quality approvals and do not move selected-option ownership out of Design.
    - Before P1 approval, Design must not call or persist `fetch_screen_code`, official ZIP `code.html`, SDK `getHtml`, `htmlCode.downloadUrl`, or equivalent HTML extraction metadata.
    - Stitch prompt generation must use prompt enhancement and current `DESIGN.md`; Gemini 3.1 Pro, Pro, or Thinking mode is requested best-effort when the Stitch surface exposes model or mode selection, with actual capability and limitations recorded in `manifest.json`.
- Local harness SoT mode:
  - `evals/local-harness/sot/snapshot.json` is the repo-local offline snapshot used by `scripts/test-local-harness.mjs`.
  - Confluence page IDs and versions in local harness files are provenance/refetch anchors, not live runtime inputs.
  - `docs/confluence/**` is a local publication mirror/evidence area derived from root runtime facts such as `PROJECT_ENVIRONMENT.md`; it is not the active runtime SoT for local validators.
  - Live Confluence publish/update requires explicit user approval with target page IDs, current versions, proposed body changes, and reviewer evidence.
- Custom agents: `.codex/agents/<agent-name>.toml`.
  - wm review routing uses dedicated read-only agents:
    - `wm-implementation-reviewer`
    - `wm-contract-reviewer`
    - `wm-docs-researcher`
    - `wm-gate-fix-advisor`
    - `po-planning-reviewer`
    - `po-scope-gate-reviewer`
    - `po-docs-researcher`
    - `design-reviewer`
    - `design-researcher`
  - legacy `mobile-*` agents remain available for other runtime/eval surfaces, but `$wm` reviewer routing and `scripts/codex-headless-review.mjs` allow only the dedicated `wm-*`, Product/Planning `po-*`, and Design `design-*` read-only agents listed above.
- Hooks: `.codex/hooks.json` and `.codex/hooks/*.mjs`.
- MCP config: `.codex/config.toml`.
- Codex MCP/CLI setup guide: `docs/CODEX_MCP_ENVIRONMENT.md`.
- Pod-native project bootstrap:
  - Sync source: `mobile-app-dev-team/runtime-sources/skills/openclaw-pod-skills-sync/`.
  - Sync runtime shape: `/workspace/skills/openclaw-pod-skills-sync/SKILL.md`.
  - Sync report: `/workspace/state/openclaw-pod-skills-sync-report.json`.
  - After clone or pull, run `openclaw-pod-skills-sync` before `project-bootstrap`.
  - Source: `mobile-app-dev-team/runtime-sources/skills/project-bootstrap/`.
  - Runtime shape: `/workspace/skills/project-bootstrap/SKILL.md`.
  - Required routing bridge: `/workspace/skills/codex-role-workflow/SKILL.md`.
  - Required managed-repo execution contract:
    `/workspace/skills/codex-interactive-repo-work/SKILL.md`; `project-bootstrap`
    must verify it is present in `/workspace/skills` after
    `openclaw-pod-skills-sync`, and role pods use it when
    `codex-role-workflow` returns `codex_interactive_required: true`.
  - Default boram checkout: `/workspace/projects/Wondermove-Inc/new-mobile-app`.
  - Required managed path registry: `/workspace/CODEX_MANAGED_PATHS.md`.
  - Default report: `/workspace/state/project-bootstrap-report.json`.
  - This is a status-only pod readiness workflow. It does not prove live
    OrbStack/OpenClaw behavior, external platform state, or human-gated actions.
- Root Claude Code artifacts are not part of the active Codex runtime, but they
  are split by tracking status:
  - tracked Claude Code helper artifacts:
    - `CLAUDE.md`
    - `.claude/skills/`
    - `.claude/agents/reviewer.md` (read-only bridge that dispatches to Codex reviewers via `scripts/codex-headless-review.mjs`; not a reviewer-logic port — full Codex→Claude reviewer ports remain deferred)
  - ignored transient Claude local state:
    - `.claude/memory/`
    - `.claude-state/`
  - `scripts/validate-runtime-artifacts.mjs` only requires `.claude-state/` to
    remain covered by `.gitignore`; `.claude/memory/` is also ignored by local
    policy. Third-party files with the same names under ignored dependency
    directories are outside this policy.
- Required project MCP servers:
  - `mobile-mcp`
  - command: `npx`
  - args: `-y @mobilenext/mobile-mcp@0.0.58`
  - local visual QA/device automation is required for mobile UI/runtime checks when a simulator or device is available.
  - it is excluded from required CI gates.
  - simulator and device operations must be serialized, not parallelized.
  - `serena`
  - command: `uvx`
  - args: `-p 3.13 --from git+https://github.com/oraios/serena@v1.5.3 serena start-mcp-server --project-from-cwd --context=codex`
  - symbolic navigation MCP for symbol overview, symbol lookup, reference search, and bounded repo code navigation.
  - `stitch`
  - command: `npx`
  - args: `-y stitch-mcp@1.3.2`
  - design-authoring MCP for Google Stitch project/screen generation and export handoff.
  - it uses local Google Cloud Application Default Credentials through `gcloud auth application-default login`.
  - actual use requires a Google Cloud project with the Stitch MCP service enabled, plus `GOOGLE_CLOUD_PROJECT` or a `gcloud config set project` value.
  - no Stitch API key is stored in the repo, `.codex/config.toml`, `EXPO_PUBLIC_*`, docs, or evidence.
  - do not use `@latest`.
- Plugin-provided MCP servers:
  - `expo`
  - URL: `https://mcp.expo.dev/mcp`
  - status: enabled
  - authentication: run `codex mcp login expo` when the target Codex session reports Expo MCP is not logged in, then verify with `codex mcp list`; auth display can be session-specific.
  - this does not replace `mobile-mcp` for local visual QA/device automation.
- Additional project-bootstrap MCP servers:
  - `atlassian`
  - command: `npx`
  - args: `-y mcp-remote@0.1.38 https://mcp.atlassian.com/v1/mcp`
  - Jira/Confluence/internal knowledge MCP. Remote auth may require user presence in the real login surface.
  - `node_repl`
  - Codex app/plugin support surface.
  - optional project-bootstrap inventory; app/plugin environment owned; do not invent a repo-local absolute path or copy another user's local path.
  - `playwright`
  - command: `npx`
  - args: `-y @executeautomation/playwright-mcp-server@1.0.12`
  - MCP browser automation support, distinct from RN Web E2E Playwright.
- Project-bootstrap-required CLI surfaces:
  - `railway`
  - required for Railway QA/API deploy/evidence readiness checks.
  - `project-bootstrap-agent-setup.sh` may install it with `npm i -g @railway/cli` only when `PROJECT_BOOTSTRAP_INSTALL_APPROVED=true`; otherwise it reports `install_blocked_needs_approval`, lists `install_plan`, keeps `installed_exact` empty, and waits for approval. `installed_exact` must list only verified successful installs; failed attempts are not installed.
  - If Railway auth is missing and a human is present, the agent runs `railway login`; the user signs in only in the Railway browser surface. Browserless fallback uses `railway login --browserless`.
  - Railway token values remain secret-safe and must not be sent in chat or evidence.
  - `gcloud`
  - required for Stitch/Google ADC readiness checks.
  - `project-bootstrap-agent-setup.sh` may install it only from an approved official Google Cloud CLI installer source and only when `PROJECT_BOOTSTRAP_INSTALL_APPROVED=true`, then recheck `gcloud --version`.
  - If gcloud auth is missing and a human is present, the agent runs `gcloud auth login`. If ADC is needed, the agent runs `gcloud auth application-default login`.
  - If project selection is missing, the user provides only the non-secret project ID; the agent runs `gcloud config set project <project-id>` and verifies with `gcloud config get-value project`.
  - `project-bootstrap-preflight.sh` consumes `/workspace/state/project-bootstrap-agent-setup-report.json` and blocks on missing/unreadable/blocked setup reports, `railway-auth-missing`, `gcloud-auth-missing`, `gcloud-adc-missing`, `expo-mcp-auth-missing`, and `expo-cli-auth-missing`.
  - Expo MCP auth and workspace Expo CLI auth are separate readiness surfaces. Expo CLI status checks use `npx --no-install expo whoami`.
  - Google ADC JSON, service account JSON, and token values remain secret-safe and must not be sent in chat or evidence.
  - Credential storage proof for GitHub, Expo, Railway, and gcloud is metadata-only: path, filename, owner/group, mode, size, and modification time. File contents are never read.
  - Approved installer env vars are `PROJECT_BOOTSTRAP_GCLOUD_INSTALLER_PATH`, `PROJECT_BOOTSTRAP_INSTALL_APPROVED`, and optional `PROJECT_BOOTSTRAP_AGENT_TOOL_BIN_DIR`.
  - EAS CLI remains the baseline exception until QA/Release EAS work or another approved EAS action is selected.
- Runtime scripts:
  - `scripts/validate-runtime-artifacts.mjs`
    - The root `validate` package script removes transient `.claude-state/` before running this validator, while the validator itself requires only `.claude-state/` to remain covered by `.gitignore`. Tracked Claude Code helper artifacts such as `CLAUDE.md`, `.claude/skills/`, and the `.claude/agents/reviewer.md` bridge are documentation/helper files, not active Codex runtime inputs.
  - `scripts/codex-headless-review.mjs`
    - Codex-only read-only helper: runs the selected Codex binary with `-a never exec -m gpt-5.5 -c 'model_reasoning_effort="high"' -s read-only`.
    - Codex binary selection uses the shared resolver in `scripts/lib/codex-binary-resolver.mjs`: prefer `CODEX_BIN`, then platform-specific absolute candidates such as `/opt/homebrew/bin/codex`, `/usr/local/bin/codex`, `/usr/bin/codex`, and `/home/linuxbrew/.linuxbrew/bin/codex`, then PATH candidates. Candidates are checked for executable status, architecture compatibility where detectable, `--version`, and `exec --help` before use.
    - On Windows, resolver validation uses executable/PATHEXT candidates and command validation instead of POSIX `file` output; `.cmd` and `.bat` wrappers are executed through the Windows command processor descriptor.
    - no Claude, `--engine auto`, or `review_engine_preference` fallback path.
    - optional machine-readable reviewer verdict validation: `node scripts/codex-headless-review.mjs --json-envelope --agent <verdict-reviewer> --prompt <text-or-file> --out <path>`.
    - verdict-producing reviewers are `wm-implementation-reviewer`, `wm-contract-reviewer`, `po-planning-reviewer`, `po-scope-gate-reviewer`, and `design-reviewer`.
    - the reviewer JSON envelope contains `verdict`, `reviewer`, `mode`, `scope`, `findings`, `checks_reviewed`, `residual_risks`, and `next_action`; `GO` requires no Critical/High/Medium findings and required checks `PASS` or source-backed `NOT_APPLICABLE`, failed required checks map to `NO_GO`, missing required checks map to `BLOCKED`, and human-gate blockers map to `NEEDS_HUMAN`.
    - researcher/advisor agents are advisory and are not valid `--json-envelope` targets.
  - `scripts/test-hooks.mjs`
  - `evals/skills/codex-run-smoke.sh`
    - self-test fixture suite for the repo-tracked source of the `/workspace/codex-hooks/codex-run` compatible launch-gate wrapper:
      `mobile-app-dev-team/runtime-sources/skills/codex-interactive-repo-work/scripts/codex-run`.
    - validates dry-run launch evidence, blocked preflight evidence, missing input handling, active human-gate blocker handling, required `$wm` prompt wording, reviewer wording, numeric room id checking, missing Codex CLI handling, and secret-safe output.
  - `scripts/validate-team-doc.mjs`
    - active managed runtime composition wrapper; runs only runtime-source docs
      and focused `codex-role-workflow` routing-support docs. It intentionally
      does not make broad structure, workflow, governance, reference, or
      managed parity checks mandatory for `validate:team-doc`.
  - `scripts/validate-team-doc-structure.mjs`
    - structure registry validator for `mobile-app-dev-team/**` target paths,
      source-map terms, RED/valid fixtures, and the explicit legacy
      compatibility window before physical rename.
  - `scripts/validate-runtime-sources.mjs`
    - repo-local runtime-source doc validator for role SOULs, the Codex
      skill/agent matrix, pod-native OpenClaw skills, pod-native runtime specs,
      and pod bootstrap source docs. It does not prove live `/workspace/skills`
      installation.
  - `scripts/validate-runtime-routing-support.mjs`
    - focused runtime routing-support validator for the files directly named by
      `codex-role-workflow`: entry-case routing, work processes,
      gates/evidence, GitHub artifact workflow, and app/EAS/OTA rollback. It
      also rejects resolving managed repo SoT from `/workspace/skills`, which is
      only a runtime snapshot.
  - `scripts/validate-workflow-docs.mjs`
    - standalone docs-quality validator for workflow and durable handoff docs;
      it is not part of the mandatory active `validate:team-doc` runtime gate
      unless a direct runtime dependency is separately wired.
  - `scripts/validate-governance-docs.mjs`
    - standalone docs-quality validator for governance docs such as
      `AGENTS.md`, SoT/principles, gates/evidence, human/ops live readiness,
      and rollback boundaries.
  - `scripts/validate-reference-docs.mjs`
    - standalone reference/source-map/archive placement validator for
      ref-organization and completed-plan crosswalks without treating
      historical `team-doc/**` as current runtime input.
  - `scripts/validate-team-doc-archive.mjs`
    - archive/reference validator for `TEAM_DOC_ARCHIVE_MANIFEST.json`,
      `TEAM_DOC_ARCHIVE_BUNDLE.jsonl`, and the historical team-doc corpus
      sourcePath strategy; it is explicit and not part of hidden local harness
      applicability.
  - `scripts/validate-team-doc-managed.mjs`
    - parity backstop preserving the previous managed-doc term checks during
      the surface-validator split. It is standalone/docs-quality now, not part
      of the mandatory active `validate:team-doc` runtime gate.
  - `scripts/validate-work-units.mjs`
    - validates committed `docs/plans/work-units/*/status.json` artifacts against the passive `wu-status/v1` status-machine schema.
    - enforces the mobile evidence ladder for `05-qa-release` `done` states.
    - `--self-test` validates positive and negative fixtures under `evals/work-units/fixtures`.
    - repo-local only: it does not prove pod execution, native behavior, EAS state, GitHub branch protection, Jira, Confluence, or other external platform state.
  - `scripts/ingest-eas-evidence.mjs`
    - offline fixture ingest and redaction self-test for `eas-evidence/v1`.
    - writes canonical evidence-shaped output for recorded EAS/Maestro JSON.
    - repo-local only: `--self-test` does not call EAS, use `EXPO_TOKEN`, run Maestro cloud jobs, or prove native/device behavior.
  - `scripts/validate-project-environment.mjs`
    - offline drift validator for `PROJECT_ENVIRONMENT.md` against executable repo facts: package manager pin, mobile package versions, MCP pins, quality-gate runtime path detection, package script composition, and local snapshot metadata.
    - `--self-test` validates positive and negative fixtures under `evals/local-harness/project-environment/fixtures`.
    - repo-local only: it does not call Confluence, Atlassian, Railway, EAS, GitHub, mobile-mcp, devices, pods, or external platform services.
  - `scripts/validate-evidence-hygiene.mjs`
    - offline evidence hygiene validator for `.evidence/` and `docs/plans/work-units/`: forbidden durable evidence paths, `.evidence/e2e-test/<YYYYMMDD-HHMMSS>-<slug>/` directory naming, and shared secret-pattern scanning with file/line errors.
    - `--self-test` validates positive and negative fixtures under `evals/local-harness/evidence-hygiene/fixtures`.
    - repo-local only: it does not call Confluence, Atlassian, Railway, EAS, GitHub, mobile-mcp, devices, pods, Google Cloud, Stitch, or external platform services.
  - `scripts/work-unit-next.mjs`
    - resolves deterministic `wm-next-action/v1` outputs from validated `wu-status/v1` work-unit state.
    - `--self-test` validates resolver fixtures under `evals/work-units/fixtures/valid/resolver-*`.
    - `--apply-transition` is limited to bounded `status.json` state updates that validate after writing.
    - repo-local only: it does not execute role work, human approval, pod execution, native behavior, EAS state, GitHub branch protection, Jira, Confluence, or other external platform state.
  - `scripts/clean-tree-guard.mjs`
  - `scripts/codex-preflight.mjs`
    - default mode checks local Codex CLI candidates and writes `evals/local-harness/results/preflight.json`.
    - `--pod` mode is repo-local pod readiness preflight: it checks role identity, Node 22, packageManager pnpm pin, Codex CLI candidate, git identity, GitHub auth status, Chromium/RN Web capability, `.codex/config.toml`, and `codex mcp list`.
    - `--pod` reports auth/EAS/GitHub/MCP readiness as redacted status only, sets `native_e2e_local: false` for boram-like pods, and adds Design-role-only Stitch local prerequisite status for ADC/project presence without printing values.
    - `--pod` exits non-zero on blockers and does not prove actual OrbStack/OpenClaw execution, native device behavior, live Stitch service enablement, or Google Cloud service state.
  - `scripts/test-local-harness.mjs`
- Manual provenance refresh:
  - `pnpm run sot:provenance-refresh:manual`
  - Advisory only: not a test, not CI, and not required by `test:runtime` or `test:local-harness`.
  - Use only to describe the human-gated provenance refresh workflow for `evals/local-harness/sot/snapshot.json`.
  - Required refresh evidence: page IDs, current versions, fetched time, diff summary, reviewer evidence, and explicit user approval before any live Confluence publish.
- Local harness path: `evals/local-harness`.
- Local harness result path: `evals/local-harness/results`.
- Runtime stability evidence path: `.evidence/`.

## CI

- GitHub quality gate: `.github/workflows/quality-gate.yml`.
- GitHub auto-merge workflow: `.github/workflows/auto-merge.yml`.
  - Triggered by successful `Quality gate` `workflow_run` events for pull requests targeting `main`.
  - Resolves the target pull request from the completed workflow run `head_sha` through GitHub's commit pull-request API, then proceeds only when exactly one open pull request targets `main` and still matches that head SHA.
  - Uses GitHub native auto-merge through `gh pr merge --auto --squash --match-head-commit`.
  - Does not check out or execute pull request head code.
  - Does not bypass required reviews, required status checks, branch protection, rulesets, or merge queue requirements.
  - Requires the external GitHub repository setting `Allow auto-merge` and sufficient workflow token permissions; local validators cannot prove those live settings.
- The quality gate relies on root `package.json` `packageManager` as the single
  pnpm version SoT; `pnpm/action-setup@v4` must not set a separate `version`
  input.
- Always runs:
  - `pnpm run test:runtime`
  - `pnpm turbo run lint test`
- Does not run `mobile-mcp`; mobile device automation remains a local QA gate.
- Local harness is required for Codex runtime and harness changes.
- Runs `pnpm run test:local-harness` when these paths change:
  - `.agents/**`
  - `.codex/**`
  - `evals/local-harness/**`
  - `scripts/lib/**`
  - `scripts/validate-runtime-artifacts.mjs`
  - `scripts/validate-repo-operations.mjs`
  - `scripts/{codex-headless-review,test-hooks,test-local-harness,clean-tree-guard,codex-preflight}.mjs`
  - `scripts/validate-project-environment.mjs`
  - `.github/workflows/*.yml`
  - `AGENTS.md`
  - `PROJECT_ENVIRONMENT.md`
  - `REPO_OPERATIONS.md`
  - `package.json`
  - `pnpm-lock.yaml`
- `mobile-app-dev-team/reports/**` changes use `validate:evidence-hygiene` and
  diff checks; local harness is not required unless a Codex runtime or harness
  path also changes. They do not trigger active `validate:team-doc` unless a
  directly managed runtime source or routing-support dependency also changes.
- `mobile-app-dev-team/ref-organization/**` changes use
  `validate:reference-docs`; local harness is not required unless a Codex
  runtime or harness path also changes. They do not trigger active
  `validate:team-doc` unless a directly managed runtime source or
  routing-support dependency also changes.
- `mobile-app-dev-team/runtime-sources/skills/**` changes
  use targeted pod-native smoke plus `test:runtime`; local harness is not
  required unless a Codex runtime or harness path also changes.
- `evals/skills/**`, `evals/team-doc-structure/**`, and durable
  `docs/plans/**` changes use their targeted validators instead of requiring
  local harness by path alone.

## Current Non-Scope

- Do not restore OpenClaw packaging scripts or generated package results unless a new source-of-truth explicitly reintroduces that runtime.
- Do not add shadcn/ui to React Native screens.
- Do not add secrets, customer-specific identifiers, or production API URLs to the repo.

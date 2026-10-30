# MedMock continuation handoff

Last updated: 2026-10-30 12:15 IST

## Latest local-readiness checkpoint (supersedes the historical RED below)

The documented `buildPublishedPaperVersionsFromImport()` RED has been resolved.
The preserved working tree advanced beyond that handoff and now includes the
remaining local Task 6 implementation:

- durable leased import processing with private paper/key/solution storage,
  production OpenAI/Gemini clients, a protected Vercel cron route, persisted
  failures, review documents, and retry metadata;
- authenticated bilingual admin review, explicit decisions, processing refresh,
  failure announcements, and atomic idempotent original/current publication;
- authenticated Supabase dashboard data, pagination, privacy rollback, and
  loading/error/empty states;
- legacy IndexedDB timing normalization, serialized sync, online attempt-creation
  recovery, local-to-server event rebinding, complete Hindi exam controls/status,
  and accessible modal focus/Escape/inert behavior;
- Next 16-compatible route modules whose test factories live outside `route.ts`;
- Vercel cron configuration and documented server-only environment variables.

Fresh local evidence on 2026-10-30:

```text
unit/component: 21 files / 95 tests passed
lint: exit 0
type-check: exit 0
production build: exit 0, 14 static pages generated
Playwright: blocked before discovery by Unsupported platform: android
```

Do not use the older "Exact resume point" as the current state. The next local
step is the fresh whole-branch review and any single RED→GREEN fix pass. The only
remaining launch checks after that require external Supabase/provider/Vercel or
Linux-CI access, as listed near the end of this document.

## Read this first

Repository: `/data/data/com.termux/files/home/projects/neet`

Branch: `feat/medmock-mvp`

Current committed HEAD: `cd58c22` — `fix: close production hardening review gaps`

The user revoked the prior `AGENTS.md` instructions. The untracked `AGENTS.md`
belongs to the user/environment; preserve it and do not commit or delete it unless
the user explicitly asks.

Preserve every committed and uncommitted file. Do not reset, checkout, delete, or
rewrite the active work. Begin with:

```sh
cd /data/data/com.termux/files/home/projects/neet
git status --short
git diff --check
```

Use the Termux workaround for every Node/npm command:

```sh
env -u LD_LIBRARY_PATH npm test
env -u LD_LIBRARY_PATH npm run lint
env -u LD_LIBRARY_PATH npm run typecheck
env -u LD_LIBRARY_PATH npm run build
```

## Committed state

Tasks 1–5 are complete. Task 6 production hardening and its first whole-branch
review fix pass are committed through `cd58c22`.

Committed milestones:

- `c5743e9` — application foundation and MedMock design system
- `6010db4` — domain model and scoring engine
- `503dfe5` — reviewed OpenAI/Gemini import foundations
- `8d1b2b3` — mock and practice exam experience
- `a508324` — results, analytics, dashboard, leaderboard UI
- `d06fd63` — Supabase/auth/RLS/deployment hardening baseline
- `cd58c22` — security, auth, attempt RPC, redaction, upload, and recovery review fixes

Before `cd58c22` was committed, fresh verification passed:

- focused regressions: 5 files / 34 tests
- full suite: 12 files / 60 tests
- lint: exit 0
- type-check: exit 0
- production build: exit 0, 13 pages generated

## Active uncommitted work

There is a second Task 6 RED→GREEN pass in progress. Preserve it.

### Exam timing and synchronization — implemented, focused GREEN

Files include:

- `src/features/exam/session.ts`
- `src/features/exam/session.test.ts`
- `src/features/exam/contracts.ts`
- `src/features/exam/persistence.ts`
- `src/features/exam/persistence.test.ts`
- `src/features/exam/exam-workspace.tsx`
- `src/features/exam/server/attempt-store.ts`
- `src/features/exam/attempt-api.test.ts`
- `supabase/migrations/202610290001_medmock_mvp.sql`

Implemented behavior:

- answer events now carry cumulative `timeSpentMs`;
- `time_spent` events preserve time when navigating or submitting;
- memory and Supabase submission paths materialize real per-question time;
- SQL stores and deduplicates timing data;
- a synchronization controller serializes overlapping batches and drains events
  queued while a request is in flight;
- submission waits for the same event drain instead of racing a second fetch;
- IndexedDB restoration merges the session queue with the separate event store;
- the creation idempotency key is removed after successful submission so a new
  attempt can be started later.

Focused evidence:

```sh
env -u LD_LIBRARY_PATH npm test -- \
  src/features/exam/persistence.test.ts \
  src/features/exam/session.test.ts \
  src/features/exam/attempt-api.test.ts \
  src/features/exam/exam-workspace.test.tsx
```

Result at the time of implementation: 4 files / 21 tests passed, followed by a
clean type-check.

Still review this code for legacy IndexedDB sessions whose new timing fields are
missing, online retry after initial attempt creation fails, and submission/status
error messaging.

### Real dashboard data — implemented, focused GREEN, live Supabase unverified

Files include:

- `src/app/dashboard/page.tsx`
- `src/features/analytics/analytics.ts`
- `src/features/analytics/analytics.test.ts`
- `src/features/analytics/analytics-workspace.tsx`
- `src/features/analytics/analytics-workspace.test.tsx`
- `src/features/analytics/server/dashboard-store.ts`

Implemented behavior:

- `/dashboard` is now an authenticated Server Component;
- unauthenticated users redirect to `/sign-in?next=/dashboard`;
- attempts, results, paper versions, timed answer events, profile privacy, and the
  leaderboard load from Supabase;
- database rows are converted through a tested DTO mapper before reaching the
  client;
- the user's current leaderboard row is identified without exposing user IDs;
- a bilingual empty-dashboard state replaces demo data for users with no results.

Focused evidence:

```sh
env -u LD_LIBRARY_PATH npm test -- \
  src/features/analytics/analytics-workspace.test.tsx \
  src/features/analytics/analytics.test.ts
```

Result: 2 files / 10 tests passed, followed by a clean type-check.

Still validate the loader against an applied Supabase migration. Improve the
privacy checkbox to roll back optimistic state and announce an error when PATCH
fails.

### Import rule preservation and review decisions — partially GREEN

Files include:

- `src/features/exam/domain.ts`
- `src/features/imports/schema.ts`
- `src/features/imports/contracts.ts`
- `src/features/imports/reconciliation.ts`
- `src/features/imports/workflow.test.ts`

Implemented behavior:

- extraction can preserve section definitions and optional selection limits;
- question disposition (`standard`, `bonus`, `dropped`) is preserved;
- marking overrides are preserved;
- answer-key provenance records provider, official, or manual source;
- an official key can override provider suggestions with a file reference;
- `applyReviewDecisions()` applies primary/secondary/manual values before marking
  a flag resolved;
- publication mapping preserves all of the above.

Earlier focused evidence passed 17 import workflow/contract tests. Current work
has advanced to the next RED test described below, so the full file is currently
expected to be red.

## Exact resume point: one intentional RED test

Run:

```sh
env -u LD_LIBRARY_PATH npm test -- src/features/imports/workflow.test.ts
```

Expected current result: 15 tests total, 14 pass, 1 fails:

```text
creates distinct immutable original-pattern and current-pattern versions
TypeError: buildPublishedPaperVersionsFromImport is not a function
```

Implement the minimum GREEN change:

1. Add `pattern: "original" | "current"` to `PaperVersionSchema`, preferably
   defaulting legacy fixtures to `"original"`.
2. Allow `buildPaperVersionFromImport()` metadata to set the pattern.
3. Implement `buildPublishedPaperVersionsFromImport()` in
   `src/features/imports/reconciliation.ts` using the exact metadata contract in
   the failing test.
4. Return two separately deep-frozen published versions with distinct IDs,
   revisions, and pattern values.
5. Re-run the focused test and type-check before proceeding.

Ruling: because the product spec requires original-pattern and current-pattern
artifacts but defines no automatic transformation rules, initial publication
creates two distinct immutable reviewed versions from the same approved content,
tagged with different pattern metadata. Future pattern changes must create a new
reviewed revision, never mutate a published version. Cost if wrong: an explicit
admin current-pattern editor/transform will be required before launch.

## Remaining implementation after the RED test

### 1. Durable import processing

- Extend `import_jobs` persistence for the reconciled document, reviewed document,
  processing lease/attempt metadata, and published version IDs.
- Store paper, answer-key, and solution file references in private Supabase
  Storage. The current UI only wires the paper file; add real inputs for the two
  supporting files.
- Implement production OpenAI and Gemini clients using server-only keys.
- Download private source files server-side, upload them to the selected provider,
  run structured extraction, reconcile outputs, and persist every failure/status.
- Use a durable claim/lease so duplicate workers cannot process the same import.
- Add a Vercel-compatible worker/cron endpoint protected by a server-only secret,
  or document and configure the chosen durable queue. Do not rely on an in-memory
  or fire-and-forget background promise.
- Add retry-safe processing tests.

### 2. Review and publication APIs/UI

- Add authenticated admin endpoints to fetch the reconciled review document,
  apply `ReviewFlagDecisionSchema` decisions, and reject unresolved publication.
- Build usable English/Hindi review UI showing every flag and provider value.
- Require explicit approval.
- Publish original/current versions atomically through a service-role-only SQL
  function; persist deterministic/idempotent published IDs.
- Preserve section limits, bonus/dropped questions, multiple accepted answers,
  marking overrides, official-key provenance, translations, and solutions.
- Keep all published revisions immutable.

### 3. Finish exam production behavior

- Normalize old IndexedDB sessions/events that lack timing fields.
- Add database-backed integration tests for refresh recovery, offline replay,
  concurrent append/finalize, duplicate batches, and expired attempts.
- Add a proper focus trap, Escape policy, focus restoration, and background
  inertness for submission dialogs.
- Complete Hindi localization for every exam control, timer, warning, dialog,
  sync state, accessible name, and status message.
- Retry attempt creation when connectivity returns rather than leaving a permanent
  local-only attempt.

### 4. Dashboard and privacy hardening

- Run the new server loader against real Supabase rows.
- Verify hidden names across reloads and from a different user session.
- Roll back/announce failed privacy updates.
- Add empty/error/loading behavior for database failures.

### 5. Final verification and launch readiness

- Apply `supabase/migrations/202610290001_medmock_mvp.sql` to a staging Supabase
  project and fix all SQL/RLS/function errors.
- Test real Google/email auth redirects.
- Test live OpenAI/Gemini calls with representative bilingual PDFs/images.
- Configure Vercel environment values and `NEXT_PUBLIC_SITE_URL`.
- Run the complete unit suite, lint, type-check, and production build.
- Run Playwright/axe on Linux CI. Android/Termux cannot run Playwright 1.58+
  (`Unsupported platform: android`), so browser success cannot be claimed here.
- Load-test staging attempt creation, event append, and finalization before
  claiming the 500-concurrent-attempt target.
- Perform a fresh whole-branch review, fix Critical/Important findings with
  RED→GREEN tests, update the ledger, and only then complete Task 6.

## Current verification warning

The full suite, lint, type-check, and production build have **not** been rerun
after the active uncommitted changes. Do not claim completion from the focused
evidence above. After the current RED becomes GREEN, run:

```sh
env -u LD_LIBRARY_PATH npm test
env -u LD_LIBRARY_PATH npm run lint
env -u LD_LIBRARY_PATH npm run typecheck
env -u LD_LIBRARY_PATH npm run build
```

## External blockers that cannot be completed purely in this checkout

- live Supabase migration/application and RLS validation needs a project URL and
  credentials;
- live OpenAI/Gemini extraction needs provider keys and billable API access;
- Google OAuth redirect verification needs configured provider credentials;
- Vercel production configuration/deployment needs account/project access;
- Linux Playwright/axe needs Linux CI or another supported host;
- 500-concurrent-attempt proof needs a staging load test.

Implement and test every local prerequisite before reporting these blockers.

## Product invariants

- Imports never auto-publish; explicit admin review is mandatory.
- Published revisions are immutable.
- Official keys override model suggestions and retain provenance.
- English/Hindi content and UI remain supported.
- Mock mode hides answers and uses a server-authoritative deadline.
- Practice locks the first answer and reveals reviewed feedback immediately.
- Attempts survive refresh/reconnection without lost or duplicated events.
- Only first strict public mocks with clear integrity are leaderboard eligible.
- Private/hidden/flagged attempts never leak identity or ranking data.
- MedMock states independence from NTA and requires publisher content rights.

## Copy-paste continuation prompt

Use the prompt below in the next chat:

```text
Work in /data/data/com.termux/files/home/projects/neet.

Preserve all committed and uncommitted work. Do not reset, checkout, delete, or
rewrite it. The prior AGENTS.md instructions were revoked; leave the untracked
AGENTS.md untouched.

Read these files in order:
1. docs/PROJECT_HANDOFF.md
2. .superpowers/sdd/2026-10-28-medmock-mvp/progress.md
3. docs/superpowers/plans/2026-10-28-medmock-mvp.md
4. docs/product/medmock-spec.md

Then run git status --short and git diff --check. Continue from the exact RED
resume point in the handoff: implement buildPublishedPaperVersionsFromImport(),
make the focused import test GREEN, and continue all remaining Task 6 work with
strict RED→GREEN tests.

Finish durable Supabase import processing, answer-key/solution storage, admin
review decisions, atomic immutable original/current publication, real dashboard
data validation, exam recovery/timing/localization/dialog accessibility, security
and privacy tests, and Vercel readiness. Use env -u LD_LIBRARY_PATH for every npm
command in Termux.

Run the full tests, lint, type-check, production build, and supported browser
tests before claiming completion. Keep working autonomously until every local
prerequisite is production-ready; clearly report only external blockers that need
Supabase/provider/Vercel/Linux-CI access.
```

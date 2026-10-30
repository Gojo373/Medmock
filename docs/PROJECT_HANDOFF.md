# MedMock continuation handoff

Last updated: 2026-10-30 17:20 IST

## Active checkpoint — all locally possible final-review fixes complete

This section supersedes every restart checkpoint below it.

- Branch: `feat/medmock-mvp`.
- Pre-fix committed base: `924597f` (`feat: complete local production readiness`).
- The single Critical/Important final-review fix pass is locally complete: all
  3 Critical and all 15 Important findings have observed RED→GREEN regression
  coverage or, for finding 18, the locally executable production-adapter and
  browser-fixture prerequisites.
- The 3 reviewer-classified Minor items remain deliberately deferred: unified
  Hindi/accessibility language metadata, time analytics for cleared/unanswered
  questions, and unfinished mobile/admin/history navigation.
- `AGENTS.md` remains untracked and untouched; do not stage or commit it.
- `git diff --check` is clean.

### Final-review fix-pass outcomes

1. Delayed expiry clamps events/timing to the deadline, enters `finalizing`, and
   retries until server acknowledgement.
2. PostgREST offset timestamps normalize to canonical UTC at database adapter
   boundaries.
3. Published Supabase original/current versions are listed, version-selected,
   opened, authenticated, redacted for strict mock, and retained for practice;
   public paper-version reads are published-only.
4. Recovery is namespaced and validated by user, version, mode, and generation;
   local snapshots/events migrate and retire safely.
5. Gemini raw REST requests use the model URL plus `generationConfig` body.
6. OpenAI/Gemini extraction JSON schema objects are complete and recursively
   strict.
7. Provider nulls normalize into reviewable missing fields.
8. Admin review shows signed private sources and complete bilingual content,
   with full-document editing.
9. Review paths understand option arrays, missing fields require replacements,
   and resolved values can be corrected before publication.
10. Reconciliation covers duration, sections, limits, membership, disposition,
    marking, subject/topic, and bilingual titles.
11. Official provenance applies only to separately extracted answer-key entries.
12. Offline queues drain in ordered batches of at most 500.
13. Trusted receipt time enforces a 30-second offline grace, flags late accepted
    events, rejects later arrivals, preserves duplicate idempotency, and browser
    event time is anchored to returned server time.
14. Next 16 Proxy refreshes Supabase sessions and persists rotated cookies for
    pages and attempt API responses.
15. Import completion/failure writes are fenced by extracting status, lease
    owner, and processing generation.
16. Matching publication retries return existing immutable IDs; conflicts fail.
17. Files upload directly to private Supabase Storage through signed URLs, then
    a small authenticated completion request queues extraction.
18. Persistent attempt RPC append/finalize, offset rows, concurrent finalization
    retry, auth refresh, publication routing, signed uploads, and authenticated
    Linux/staging browser fixture requirements now have production-path
    contracts. Applied database/RLS and browser execution remain external.

### Fresh final local evidence

```text
env -u LD_LIBRARY_PATH npm test
→ 26 files / 116 tests passed

env -u LD_LIBRARY_PATH npm run lint
→ exit 0

env -u LD_LIBRARY_PATH npm run typecheck
→ exit 0

env -u LD_LIBRARY_PATH npm run build
→ exit 0; 14 static pages generated; all dynamic routes and Next 16 Proxy compiled

env -u LD_LIBRARY_PATH npm run test:e2e
→ exit 1 before discovery: Playwright Unsupported platform: android
```

The Android Playwright result is the only local gate that cannot execute on this
host. The suite now distinguishes unauthenticated redirects from real protected
screen success and contains a conditional authenticated staging journey using
`E2E_AUTH_STORAGE_STATE`, `E2E_PUBLISHED_PAPER_ID`, and
`E2E_PUBLISHED_VERSION_ID`.

### Task 6 status and genuine external blockers

Task 6 remains open; do not claim production readiness until these execute:

- apply the migration and validate published-only RLS, claim fencing, receipt
  grace, append/finalize concurrency, and multi-user isolation in staging
  Supabase;
- run representative real OpenAI/Gemini bilingual PDF/image imports;
- validate Google/email OTP, cookie rotation, signed uploads, cron, and Vercel
  configuration in deployment;
- run the Playwright/axe suite with authenticated fixtures on Linux;
- load-test staging toward 500 concurrent attempts.

No additional locally reproducible Critical/Important review work remains at
this checkpoint. The intended commit subject is
`fix: close final production review findings`.

## Active restart checkpoint — paused during finding 3 RED

This section supersedes the 13:00 checkpoint immediately below it. The user
explicitly paused implementation and requested a complete continuation handoff.

- Branch remains `feat/medmock-mvp` at committed HEAD `924597f`.
- No final-review fix-pass commit exists. Preserve every current tracked and
  untracked change; do not reset, checkout, delete, or rewrite the active work.
- Do not stage, edit, delete, or commit the untracked `AGENTS.md`.
- `git diff --check` was clean at this pause.
- Critical finding 1 remains focused-GREEN exactly as documented below.
- Critical finding 2 is now focused-GREEN.
- Critical finding 3 has intentional RED tests in progress; production code for
  finding 3 has not been changed yet.

### Completed since the 13:00 checkpoint — Critical finding 2 GREEN

The existing offset-timestamp RED was reproduced with:

```sh
env -u LD_LIBRARY_PATH npm test -- \
  src/features/exam/attempt-api.test.ts \
  src/features/analytics/analytics.test.ts
```

Observed RED: 2 files / 16 tests, 14 passed and 2 failed. Dashboard attempt
mapping rejected realistic PostgREST `+00:00` timestamps, and
`normalizeAttemptDatabaseRow()` did not exist.

Implemented the minimum shared adapter-boundary fix:

- added `src/lib/database-timestamps.ts` with strict offset-aware parsing and
  canonical UTC `Z` normalization;
- exported and applied `normalizeAttemptDatabaseRow()` in
  `src/features/exam/server/attempt-store.ts` for attempt creation replay and
  persistent recovery/finalization rows;
- applied the same shared normalization to dashboard attempts and leaderboard
  timestamps in `src/features/analytics/analytics.ts`.

Focused GREEN evidence:

```text
env -u LD_LIBRARY_PATH npm test -- src/features/exam/attempt-api.test.ts src/features/analytics/analytics.test.ts
→ 2 files / 16 tests passed
```

### Exact active RED — resume Critical finding 3 here

The installed Next 16 guides for Server/Client Components, server-side data
fetching, and dynamic route params were read before starting route work.

Intentional RED coverage now exists in:

- `src/features/landing/landing-page.test.tsx` — passes a realistic published
  Supabase summary and requires the library to link to
  `/papers/<paperId>?version=<versionId>`;
- `src/features/papers/published-paper-store.test.ts` — requires published
  original/current row mapping, UTC timestamp normalization, deterministic
  current-version selection, and explicit version selection;
- `src/app/papers/published-paper-pages.test.tsx` — requires the detail page to
  load the requested version, strict mock/practice entry to require
  authentication, mock content to be redacted, and practice content to retain
  reviewed answers/solutions.

The first two RED tests were run with:

```sh
env -u LD_LIBRARY_PATH npm test -- \
  src/features/papers/published-paper-store.test.ts \
  src/features/landing/landing-page.test.tsx
```

Observed RED:

- the store suite failed to resolve the intentionally missing
  `@/features/papers/server/published-paper-store` module;
- the landing test failed because `LandingPage` still ignores the supplied
  published-paper list and renders hard-coded samples;
- existing landing/auth coverage remained green (4 tests passed).

`src/app/papers/published-paper-pages.test.tsx` was added after that RED run but
was not executed because the user paused the session. Run all three finding-3
test files first and record the complete RED before implementation:

```sh
env -u LD_LIBRARY_PATH npm test -- \
  src/features/papers/published-paper-store.test.ts \
  src/features/landing/landing-page.test.tsx \
  src/app/papers/published-paper-pages.test.tsx
```

Then implement the minimum GREEN path:

1. Add `src/features/papers/server/published-paper-store.ts` with pure row
   mapping/selection helpers plus server-only Supabase loaders for published
   summaries and versions. Parse every `content` value through
   `PaperVersionSchema` and normalize database timestamps at the boundary.
2. Extend `PaperSummary`, `PaperCard`, and `LandingPage` to accept serializable
   bilingual published summaries, show original/current pattern, and include the
   selected version in the detail link. Preserve the local sample fallback only
   when Supabase server configuration is absent.
3. Make `src/app/page.tsx` a Server Component that loads published summaries and
   passes them into the existing interactive landing Client Component.
4. Update the paper detail, mock, and practice pages to load the requested
   published version by `paperId` plus `searchParams.version`; use `notFound()`
   for invalid/unpublished pairs.
5. Require authentication before mock/practice entry using the existing
   `headers()` + `getRequestUser()` pattern. Redirect to `/sign-in?next=...`
   with the complete encoded paper/version destination.
6. Pass `redactPaperForStrictMock()` output only to strict mock; pass the
   reviewed published version to practice.
7. Update the `paper_versions` read policy so anonymous/authenticated users can
   read only rows whose status is `published`; immutable/admin write constraints
   must remain intact. Staging RLS execution remains an external validation.
8. Rerun the three focused files GREEN before moving to Important finding 4.

### Current working tree to preserve

Tracked modifications:

- `docs/PROJECT_HANDOFF.md`
- `docs/superpowers/plans/2026-10-28-medmock-mvp.md`
- `src/features/analytics/analytics.test.ts`
- `src/features/analytics/analytics.ts`
- `src/features/exam/attempt-api.test.ts`
- `src/features/exam/exam-workspace.tsx`
- `src/features/exam/recovery.test.ts`
- `src/features/exam/recovery.ts`
- `src/features/exam/server/attempt-store.ts`
- `src/features/exam/session.test.ts`
- `src/features/exam/session.ts`
- `src/features/landing/landing-page.test.tsx`

Untracked files to preserve:

- `AGENTS.md` — user/environment file; never stage or edit
- `src/app/papers/published-paper-pages.test.tsx`
- `src/features/papers/published-paper-store.test.ts`
- `src/lib/database-timestamps.ts`

The full suite, lint, type-check, build, and e2e checks remain stale until all 18
accepted Critical/Important findings are handled. After finding 3, continue with
Important findings 4–18 in the order already documented below, using one focused
RED→GREEN cycle per finding.

## Active restart checkpoint — final-review fix pass interrupted after finding 1

This section supersedes the 12:30 checkpoint immediately below it.

- Work remains on `feat/medmock-mvp` at committed HEAD `924597f`.
- Preserve every current modification. The working tree intentionally contains
  the prior handoff/plan edits, the active RED→GREEN implementation files listed
  below, and untracked `AGENTS.md`.
- `git diff --check` was clean at this checkpoint.
- No fix-pass commit has been created. Do not stage, edit, delete, or commit
  `AGENTS.md`.
- The final-review audit was completed against the current code. All 3 Critical
  and all 15 Important findings were reproduced/verified and accepted into the
  single fix pass. Finding 18 is split between local production-path contract
  coverage (required in this pass) and genuine staging Supabase/Linux browser
  execution (external validation).

### Completed in the active uncommitted pass

Critical finding 1, delayed timer expiry, has a focused RED→GREEN implementation:

- `src/features/exam/session.test.ts` first failed because a tick at
  `deadline + 1ms` produced `status: submitted` instead of a distinct local
  finalization state.
- `src/features/exam/session.ts` now clamps the final `time_spent` event and
  accrued time to the authoritative deadline, enters `finalizing`, and changes
  to `submitted` only after `CONFIRM_SUBMIT` carries the server timestamp.
- `src/features/exam/recovery.test.ts` first failed because retry-until-acknowledged
  finalization did not exist.
- `src/features/exam/recovery.ts` now provides `createRetryingFinalizer()`.
- `src/features/exam/exam-workspace.tsx` now distinguishes finalizing from
  submitted UI, does not offer “View results” before acknowledgement, and wires
  automatic two-second retries until finalization succeeds.
- Focused GREEN command and result:

```sh
env -u LD_LIBRARY_PATH npm test -- \
  src/features/exam/recovery.test.ts \
  src/features/exam/session.test.ts \
  src/features/exam/exam-workspace.test.tsx
```

Result: 3 files / 16 tests passed.

### Exact active RED — resume here

Critical finding 2, PostgREST offset timestamps, has tests written and observed
RED; production code has not been changed for this finding yet.

Modified tests:

- `src/features/analytics/analytics.test.ts` now supplies realistic
  `2026-10-28T10:00:00+00:00` attempt/dashboard timestamps and expects normalized
  UTC `Z` strings.
- `src/features/exam/attempt-api.test.ts` now requires an adapter-boundary
  `normalizeAttemptDatabaseRow()` for `started_at`, `deadline_at`, and
  `submitted_at`.

RED command:

```sh
env -u LD_LIBRARY_PATH npm test -- \
  src/features/exam/attempt-api.test.ts \
  src/features/analytics/analytics.test.ts
```

Observed result: 2 files ran, 16 tests total, 14 passed and 2 failed:

1. dashboard mapping throws a `ZodError` for `startedAt`, `deadlineAt`, and
   `submittedAt` because default `z.string().datetime()` rejects `+00:00`;
2. attempt adapter test throws `TypeError: normalizeAttemptDatabaseRow is not a
   function` because the boundary normalizer is not implemented.

Next action: implement one shared strict database timestamp normalizer, use it at
the attempt-store and dashboard row adapter boundaries, rerun the exact command
GREEN, then proceed to Critical finding 3 (published Supabase papers in the
library/details/authenticated mock/practice routes).

### Current active implementation files

Preserve these uncommitted files exactly and continue incrementally; do not
rewrite them from scratch:

- `src/features/exam/session.ts`
- `src/features/exam/session.test.ts`
- `src/features/exam/recovery.ts`
- `src/features/exam/recovery.test.ts`
- `src/features/exam/exam-workspace.tsx`
- `src/features/exam/attempt-api.test.ts`
- `src/features/analytics/analytics.test.ts`

The full suite, lint, type-check, build, and e2e commands are stale after these
changes. Do not claim the pass complete until all 18 accepted findings have been
handled, all focused tests are GREEN, and the final gate commands in the 12:30
checkpoint have been run.

## Current restart checkpoint — final review returned, Task 6 remains open

This section supersedes every older resume point below.

- Branch: `feat/medmock-mvp`
- Committed HEAD: `924597f` — `feat: complete local production readiness`
- Before this documentation handoff, the working tree contained only
  `?? AGENTS.md`. The handoff itself intentionally leaves tracked documentation
  edits in `docs/PROJECT_HANDOFF.md` and the implementation plan; preserve them.
- `git diff --check` was clean before and after the documentation update.
- Last complete local verification before the final review: 21 test files / 95
  tests passed; lint, type-check, and production build exited 0; 14 pages built.
- Playwright still exits before test discovery on Termux/Android with
  `Unsupported platform: android`.
- Fresh whole-branch review package:
  `.superpowers/sdd/2026-10-28-medmock-mvp/review-c9df7d6..924597f.diff`.
- Full review report:
  `.superpowers/sdd/2026-10-28-medmock-mvp/final-review-2026-10-30.md`.
- Review verdict: **Ready to merge: No.** Task 6 is not complete.

### Exact resume point

Use the `receiving-code-review`, `systematic-debugging`,
`test-driven-development`, and `verification-before-completion` skills. Verify
each reviewer claim against the current code, then perform the plan's single
Critical/Important fix pass. Every accepted finding needs a regression test
observed RED before implementation and GREEN afterward. Do not fix the Minor
items during this pass; ledger them as deferred unless the user expands scope.

Start with the three Critical findings, in this order because they block the
student journey and attempt integrity:

1. **Timer expiry cannot finalize.** A tick just after the deadline queues a
   `time_spent` event after the deadline, SQL rejects it, queue draining blocks
   finalization, and the workspace can display a completion-like modal anyway.
   First RED: delayed tick at `deadline + 1ms`; clamp accrued time/event time to
   the deadline and keep retrying until server finalization is acknowledged.
2. **PostgREST timestamps fail schemas.** Real `+00:00` timestamp strings fail
   `z.string().datetime()` in attempt recovery/finalization and dashboard DTOs.
   First RED: realistic database rows with offset timestamps; normalize at the
   database adapter boundary or explicitly accept offsets.
3. **Published papers are unreachable.** Student paper/mock/practice routes and
   the library are hardwired to sample fixtures, so Supabase publications cannot
   be selected or attempted. First RED: a published Supabase paper/version can
   be listed, opened, and passed to authenticated mock/practice entry with
   appropriate answer redaction.

Then address all verified Important findings in the same fix pass:

4. Namespace and validate local recovery by authenticated user, paper version,
   mode, and attempt generation; retire stale snapshots safely.
5. Translate Gemini adapter input to the real REST body (`generationConfig`,
   model in URL) and assert the outgoing request.
6. Replace the underspecified OpenAI strict schema with a complete recursive
   schema using `additionalProperties: false` on every object.
7. Normalize provider-permitted null fields into the internal partial extraction
   model so incomplete scans become review flags instead of failed jobs.
8. Show/edit the complete bilingual source/question/section/solution content in
   admin review, not only conflicts.
9. Make review paths schema-aware for option arrays; forbid resolving required
   missing values without a valid replacement and allow correction pre-publish.
10. Reconcile/flag duration, sections, optional limits, disposition, marking,
    subject/topic, and bilingual section-title disagreements.
11. Establish authoritative answer-key entries separately; apply `official`
    provenance only where the uploaded key actually supports the answer.
12. Drain offline events in bounded batches of at most 500 while preserving
    ordering/idempotency.
13. Enforce a trusted receipt-time/offline-grace integrity policy rather than
    trusting backdated client `occurredAt` values; anchor timing to server time.
14. Persist refreshed Supabase auth cookies through a Next-compatible response
    boundary and test token rotation during sync/finalization.
15. Fence import completion/failure writes with claim token/generation and
    expected status so expired workers cannot overwrite newer work/review.
16. Make publication retries return existing matching publication IDs instead of
    rejecting already-published jobs.
17. Replace Vercel-function multipart uploads with authenticated signed uploads
    to private Supabase Storage plus a small registration/finalization request.
18. Replace test shortcuts with realistic production-path coverage: database
    timestamps/concurrency/recovery, authenticated browser fixtures, publication,
    append/finalize, and RLS-aware contracts.

Reviewer-classified Minor items to defer and report:

- incomplete consolidated Hindi UI/accessibility language metadata;
- time analytics omit time spent on cleared/unanswered questions;
- unfinished mobile/admin/history navigation controls.

After the fix pass, run exactly:

```sh
env -u LD_LIBRARY_PATH npm test
env -u LD_LIBRARY_PATH npm run lint
env -u LD_LIBRARY_PATH npm run typecheck
env -u LD_LIBRARY_PATH npm run build
env -u LD_LIBRARY_PATH npm run test:e2e
```

The last command is expected to remain externally blocked on Android, but must
still be recorded. Update the progress ledger and this handoff with RED→GREEN
evidence and the new commit. Keep Task 6 open until the external validations are
actually performed.

### Remaining external validation after local fixes

- Apply the migration and exercise RLS/functions/transactions in staging
  Supabase with multiple users and an admin.
- Run representative real OpenAI and Gemini bilingual PDF/image imports.
- Validate Google/email OTP redirects, token refresh, Vercel variables, cron,
  and deployed signed uploads.
- Run Playwright/axe on Linux and exercise the authenticated end-to-end journey.
- Load-test staging attempt creation, event append, and finalization toward the
  500-concurrent-attempt target.

### Rough remaining effort

Estimate, not verification: the local Critical/Important pass is roughly 15–30
focused AI engineering hours (about 2–5 sustained sessions, depending on test and
schema fallout). External staging/browser/provider validation is another 4–12
hands-on hours once credentials and Linux CI are available. The feature surface
is broadly implemented, but production readiness is approximately 70–80% because
the remaining defects sit on core end-to-end paths.

## Historical local-readiness checkpoint (superseded by the section above)

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

Do not use the older "Exact resume point" as the current state. The whole-branch
review has now returned; use the Current restart checkpoint above and its single
RED→GREEN Critical/Important fix pass.

## Read this first

Repository: `/data/data/com.termux/files/home/projects/neet`

Branch: `feat/medmock-mvp`

Current committed HEAD: `924597f` — `feat: complete local production readiness`

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

## Historical uncommitted work (now committed and superseded)

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

## Historical resume point: resolved intentional RED test

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

## Historical remaining-work list (implemented before the final review)

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

## Historical verification warning (no longer current)

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

## Copy-paste continuation prompt (current)

Use the prompt below in the next chat:

```text
Work in /data/data/com.termux/files/home/projects/neet.

Preserve all committed and uncommitted work. Do not reset, checkout, delete, or
rewrite it. Leave the untracked AGENTS.md untouched.

Read these files in order:
1. docs/PROJECT_HANDOFF.md
2. .superpowers/sdd/2026-10-28-medmock-mvp/progress.md
3. docs/superpowers/plans/2026-10-28-medmock-mvp.md
4. docs/product/medmock-spec.md

Then run git status --short and git diff --check. HEAD should be 924597f. Preserve
the intentional documentation handoff edits and the untracked AGENTS.md. The old
buildPublishedPaperVersionsFromImport RED is resolved; do not resume there.

Read the full final review at:
.superpowers/sdd/2026-10-28-medmock-mvp/final-review-2026-10-30.md

Task 6 remains open. Use receiving-code-review, systematic-debugging,
test-driven-development, and verification-before-completion. Trust the completed
review audit recorded in the ledger; do not re-audit the repository. Critical
finding 1 (delayed expiry) and finding 2 (PostgREST offset timestamps) are already
uncommitted focused-GREEN. Do not restart or rewrite them.

Resume Critical finding 3 at the newest top checkpoint. Three intentional RED
test files now exist. The library/store RED was observed; the route file was
added afterward and has not yet run. First run exactly:

env -u LD_LIBRARY_PATH npm test -- \
  src/features/papers/published-paper-store.test.ts \
  src/features/landing/landing-page.test.tsx \
  src/app/papers/published-paper-pages.test.tsx

Then implement the minimum GREEN published-paper path described in the top
checkpoint: a server-only Supabase published-paper store, bilingual serializable
library summaries with original/current selection, Server Component loading,
detail/version lookup, authenticated mock/practice entry, strict-mock answer
redaction, reviewed practice content, and a published-only RLS read policy.
Rerun those three files GREEN before continuing Important findings 4–18 in the
review order. Use one observed focused RED→GREEN cycle per accepted finding. Do
not silently fix the 3 Minor items; ledger them as deferred unless I expand scope.

Use env -u LD_LIBRARY_PATH for every npm command. After the fix pass run the full
test suite, lint, type-check, production build, and npm run test:e2e. Record the
Android Playwright limitation if it still blocks before discovery. Update the
ledger and handoff with exact RED→GREEN and gate evidence, commit the local fixes
without staging AGENTS.md, and keep working autonomously until every local
prerequisite is production-ready.

Only then report genuine external blockers: live Supabase migration/RLS and
transaction validation, real OpenAI/Gemini bilingual imports, Google/email auth
and Vercel configuration/deployment, Linux Playwright/axe, and the staging
500-concurrent-attempt load test. Do not claim Task 6 or production readiness
until those validations have actually passed.
```

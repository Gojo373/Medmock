# MedMock MVP Implementation Plan

> For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

Goal: Build a production-ready bilingual NEET paper-to-CBT platform with reviewed AI imports, resilient exam attempts, analytics, and rankings.

Architecture: Use a single Next.js App Router application with feature-focused TypeScript modules. Supabase owns authentication, Postgres, storage, and row-level security; provider adapters isolate OpenAI and Gemini; browser IndexedDB plus idempotent APIs protect in-progress attempts.

Tech Stack: Node.js, npm, Next.js, React, TypeScript, Tailwind CSS, Motion, Zod, Vitest, Testing Library, Playwright, Supabase, OpenAI Responses API, Google Gemini API.

Spec: docs/product/medmock-spec.md

## Global Constraints

- Use the MedMock brand and the tagline "Practice the paper. Master the pressure."
- Full English/Hindi UI and question localization.
- Responsive desktop-first UI, light exam default, dark mode, WCAG 2.2 AA.
- No import may publish without explicit admin review.
- Published paper revisions are immutable.
- Initial target: 10,000 users and 500 concurrent attempts.

## Review Focus

- Scanned/bilingual papers with missing fields must become review flags, never silently valid content.
- Timer expiry, refresh, duplicate submission, and reconnection must not lose or double-count answers.
- Optional-section limits and bonus/multiple-accepted answers must score correctly.
- Practice answers must reveal immediately while mock answers remain hidden.
- Private or integrity-flagged attempts must not leak into public rankings.

---

### Task 1: Application foundation and MedMock design system

Files: Create the Next.js/test configuration, global theme, layout, reusable UI primitives, bilingual dictionaries, landing page, library, and authentication shell.

Interfaces: Produces shared Button, GlassPanel, BrandMark, ThemeToggle, locale helpers, navigation, and sample paper fixtures consumed by later tasks.

- [x] Write component tests for brand rendering, language switching, responsive navigation, and the paper library.
- [x] Run the tests and verify they fail because the application components do not exist.
- [x] Implement the minimal application foundation and public/student shells.
- [x] Run unit tests, lint, and type-check.
- [x] Commit the foundation.

### Task 2: Domain model, paper rules, and scoring engine

Files: Create domain schemas for papers, sections, questions, versions, attempts, answers, results, and leaderboard policy plus pure scoring and analytics functions.

Interfaces: Produces Zod-backed PaperVersion, Question, Attempt, AttemptResult, scoreAttempt(), and buildAttemptAnalytics().

- [x] Write failing tests for negative marking, optional limits, multiple accepted answers, bonus/dropped questions, subject totals, and percentile eligibility.
- [x] Implement the minimum domain and scoring functions.
- [x] Run the focused and full suites.
- [x] Commit the domain engine.

### Task 3: Reviewed OpenAI/Gemini import workflow

Files: Create a versioned extraction schema, provider interface, OpenAI and Gemini adapters, reconciliation engine, import state machine, admin import/review UI, and API route contracts.

Interfaces: Produces ExtractionDocument, ExtractionProvider, reconcileExtractions(), review flags, and import status APIs.

- [x] Write failing tests for provider selection, field conflicts, confidence flags, missing keys, and publish validation.
- [x] Implement provider adapters using structured JSON output and injected clients.
- [x] Implement import/reconciliation services and admin screens.
- [x] Run unit tests, lint, and type-check.
- [x] Commit the reviewed import workflow.

### Task 4: Mock and practice exam experience

Files: Create the exam reducer/store, timer, IndexedDB persistence adapter, question palette, subject navigation, mock/practice workspaces, and attempt APIs.

Interfaces: Consumes PaperVersion and produces idempotent answer events and finalized AttemptResult records.

- [x] Write failing tests for answer transitions, practice reveal, mock concealment, optional limits, submit confirmation, expiry, and offline queue merging.
- [x] Implement the reducer and persistence behavior.
- [x] Implement responsive mock and practice interfaces.
- [x] Run focused tests, full tests, lint, and type-check.
- [x] Commit the exam experience.

### Task 5: Results, analytics, dashboard, and leaderboard

Files: Create result summaries, solution review, topic/subject/time analytics, student dashboard/history, provisional leaderboard, privacy controls, and integrity eligibility rules.

Interfaces: Consumes attempt events/results and produces personal analytics and ranked first-attempt entries.

- [x] Write failing tests for analytics, first-attempt ranking, privacy, provisional percentile, tie breakers, and integrity exclusions.
- [x] Implement analytics services and UI.
- [x] Run unit tests, lint, and type-check.
- [x] Commit results and rankings.

Completion note (2026-10-29): analytics services, bilingual results/dashboard UI, responsive styling, reusable demo data, privacy controls, and the `/dashboard` route are implemented. The full unit suite, lint, type-check, and production build passed before commit.

### Task 6: Persistence, security, observability, and production verification

Files: Add Supabase migrations/RLS, server clients, API validation/idempotency, environment documentation, error boundaries, accessibility checks, Playwright smoke tests, deployment configuration, and README.

Interfaces: Finalizes the database/API contract and deployable application.

- [x] Write failing contract tests for authorization, version immutability, idempotent submission, and public/private data boundaries.
- [x] Implement migrations, policies, server services, and production configuration.
- [ ] Run the complete unit suite, lint, type-check, production build, and browser smoke tests.
- [x] Perform whole-branch review and fix Critical/Important findings with RED-GREEN tests.
- [x] Commit production hardening.

Continuation note (2026-10-30): local implementation and verification are
committed through `924597f` (21 files / 95 tests; lint, type-check, and build
passed). The fresh whole-branch review returned **Ready to merge: No** with 3
Critical, 15 Important, and 3 Minor findings. Task 6 remains open. Perform one
strict RED→GREEN fix pass for all verified Critical/Important findings, defer the
Minor findings, rerun every local gate, then complete the external Supabase,
provider, Vercel, Linux-browser, and load validations. The exact queue and
continuation prompt are in `docs/PROJECT_HANDOFF.md`; the full review is in the
plan workspace.

Active interruption note (2026-10-30 13:00 IST): Critical finding 1 is
uncommitted focused-GREEN (expiry clamping, distinct finalizing state, and retry
until server acknowledgement; 3 files / 16 tests passed). Critical finding 2 is
the exact active RED: the attempt/dashboard timestamp tests use realistic
PostgREST `+00:00` values and currently fail at the missing adapter normalizer and
Zod datetime boundary. Resume from the top checkpoint in
`docs/PROJECT_HANDOFF.md`; do not restart finding 1 or discard the dirty files.

Latest interruption note (2026-10-30 13:11 IST): Critical finding 2 is now
uncommitted focused-GREEN (2 files / 16 tests passed) through a shared strict
database timestamp normalizer applied at attempt/dashboard adapter boundaries.
Critical finding 3 is the active RED. Library/store tests were observed failing
because the published-paper store is missing and the landing page remains
fixture-backed; a paper detail/mock/practice route test was then added but not
run before the user paused. Resume from the newest top checkpoint in
`docs/PROJECT_HANDOFF.md`, run all three finding-3 files RED, implement the
Supabase published-paper journey and published-only read policy, then continue
Important findings 4–18. Preserve every dirty/untracked file and do not touch
untracked `AGENTS.md`.

Local fix-pass completion note (2026-10-30 17:20 IST): all 3 Critical and all
15 Important final-review findings now have locally observed RED→GREEN coverage
or locally executable production-path prerequisites. Fresh verification passed
26 files / 116 tests; lint, type-check, and production build exited 0 with 14
static pages plus all dynamic routes and the Next 16 Proxy compiled. Playwright
still exits before discovery on Android with `Unsupported platform: android`.
The 3 Minor findings remain deferred. Task 6 stays open solely for the documented
staging Supabase/RLS/concurrency, live provider, deployed auth/Vercel/signed
upload, Linux Playwright/axe, and 500-concurrent-attempt validations.

### Task 6 final continuation (2026-11-01)

The user expanded scope to finish the remaining project. Execute in this
session without delegation; preserve the provider follow-up already in progress.

- [x] Verify the preserved AgentRouter removal and explicit `OPENAI_IMPORTS_ENABLED=true` gate, with Gemini enabled by default; reject unsupported provider selections and test authenticated admin visibility.
- [x] Observe RED for a shared locale across landing, exam, imports/review, dashboard/loading/error, and theme controls, including `html.lang`; implement one root locale provider with persistent English/Hindi preference and translated accessible names.
- [x] Observe RED for cleared/unanswered-question time in dashboard, subject/topic/pace analytics, and finalization; preserve cumulative question timings independently from selected answers, with legacy answer-time fallback.
- [x] Observe RED for mobile disclosure navigation, admin links targeting implemented destinations, and history selection; implement accessible controls and selected-attempt analysis.
- [x] Run focused GREEN after each behavior, then `env -u LD_LIBRARY_PATH npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, and `npm run test:e2e` (each npm command prefixed with the Termux workaround).
- [x] Check validation environment names/presence only, run available read-only or rollback-only validation, self-review changed files, update handoff/ledger/report, and commit all finished repository work except `AGENTS.md`.

Task 6 completion still requires every mandatory local and external gate to
actually pass. Do not deploy, push, publish, change auth settings, or claim
production readiness from successful unit tests alone.

Current execution note (2026-11-01): the user-expanded local follow-up is
implemented, including the three Minor findings and a separately observed
RED→GREEN summary-only public detail boundary. Final unchanged-source verification
passed 29 files / 135 tests in 190.10s; lint, type-check, and production build exited 0
(14/14 generated pages, every dynamic route and Next 16 Proxy compiled).
Browser verification exits 1 before discovery on Android with
`Error: Unsupported platform: android`.
Task 6 remains open for Linux authenticated Playwright/axe, actual staging
fixtures/SQL access and final migration validation, deployed auth/Vercel/signed
upload/cron checks, representative provider generation, and the 500-concurrent
attempt target. Fresh read-only service/model checks passed; Google is disabled,
the browser state file is missing, published IDs are placeholders, and no
published staging paper is present. The final local commit subject is
`fix: finish provider controls and bilingual student flows`. See the current
handoff and final task report; Task 6 is not complete.

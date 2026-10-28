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

- [ ] Write component tests for brand rendering, language switching, responsive navigation, and the paper library.
- [ ] Run the tests and verify they fail because the application components do not exist.
- [ ] Implement the minimal application foundation and public/student shells.
- [ ] Run unit tests, lint, and type-check.
- [ ] Commit the foundation.

### Task 2: Domain model, paper rules, and scoring engine

Files: Create domain schemas for papers, sections, questions, versions, attempts, answers, results, and leaderboard policy plus pure scoring and analytics functions.

Interfaces: Produces Zod-backed PaperVersion, Question, Attempt, AttemptResult, scoreAttempt(), and buildAttemptAnalytics().

- [ ] Write failing tests for negative marking, optional limits, multiple accepted answers, bonus/dropped questions, subject totals, and percentile eligibility.
- [ ] Implement the minimum domain and scoring functions.
- [ ] Run the focused and full suites.
- [ ] Commit the domain engine.

### Task 3: Reviewed OpenAI/Gemini import workflow

Files: Create a versioned extraction schema, provider interface, OpenAI and Gemini adapters, reconciliation engine, import state machine, admin import/review UI, and API route contracts.

Interfaces: Produces ExtractionDocument, ExtractionProvider, reconcileExtractions(), review flags, and import status APIs.

- [ ] Write failing tests for provider selection, field conflicts, confidence flags, missing keys, and publish validation.
- [ ] Implement provider adapters using structured JSON output and injected clients.
- [ ] Implement import/reconciliation services and admin screens.
- [ ] Run unit tests, lint, and type-check.
- [ ] Commit the reviewed import workflow.

### Task 4: Mock and practice exam experience

Files: Create the exam reducer/store, timer, IndexedDB persistence adapter, question palette, subject navigation, mock/practice workspaces, and attempt APIs.

Interfaces: Consumes PaperVersion and produces idempotent answer events and finalized AttemptResult records.

- [ ] Write failing tests for answer transitions, practice reveal, mock concealment, optional limits, submit confirmation, expiry, and offline queue merging.
- [ ] Implement the reducer and persistence behavior.
- [ ] Implement responsive mock and practice interfaces.
- [ ] Run focused tests, full tests, lint, and type-check.
- [ ] Commit the exam experience.

### Task 5: Results, analytics, dashboard, and leaderboard

Files: Create result summaries, solution review, topic/subject/time analytics, student dashboard/history, provisional leaderboard, privacy controls, and integrity eligibility rules.

Interfaces: Consumes attempt events/results and produces personal analytics and ranked first-attempt entries.

- [ ] Write failing tests for analytics, first-attempt ranking, privacy, provisional percentile, tie breakers, and integrity exclusions.
- [ ] Implement analytics services and UI.
- [ ] Run unit tests, lint, and type-check.
- [ ] Commit results and rankings.

### Task 6: Persistence, security, observability, and production verification

Files: Add Supabase migrations/RLS, server clients, API validation/idempotency, environment documentation, error boundaries, accessibility checks, Playwright smoke tests, deployment configuration, and README.

Interfaces: Finalizes the database/API contract and deployable application.

- [ ] Write failing contract tests for authorization, version immutability, idempotent submission, and public/private data boundaries.
- [ ] Implement migrations, policies, server services, and production configuration.
- [ ] Run the complete unit suite, lint, type-check, production build, and browser smoke tests.
- [ ] Perform whole-branch review and fix Critical/Important findings with RED-GREEN tests.
- [ ] Commit production hardening.

# Optional Hindi Paper Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Allow reviewed English-only papers to publish and remain fully usable while preserving Hindi content and Hindi application UI whenever translations are available.

**Architecture:** Keep English mandatory in the import and published-paper contracts, make Hindi localized values optional, and centralize locale fallback so a Hindi UI safely displays English paper content when a translation is absent. Reconciliation will stop creating blocking flags for absent Hindi, prune legacy Hindi-missing flags from already-extracted imports, and retain all non-language review, answer, structure, and publication gates.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Zod, Vitest, Testing Library, Supabase JSON paper versions.

**Spec:** `docs/product/medmock-spec.md`, amended by the 2026-11-01 user requirement that paper content may be English-only while the application interface remains English/Hindi.

## Global Constraints

- English paper titles, section titles, question stems, options, and reviewed solutions remain mandatory.
- Hindi paper content is optional; missing Hindi must never render `undefined`, an empty control label, or a false bilingual claim.
- Existing complete bilingual papers retain their Hindi content and behavior.
- Missing answers, invalid answer keys, structural errors, low-confidence extracted content, and explicit admin review remain blocking.
- Published revisions remain immutable and no import auto-publishes.
- No database migration is required because paper content is stored as validated JSON.

## Review Focus

- English missing while Hindi exists must remain a blocking `missing_field` condition.
- Existing stored imports containing unresolved `*.hi` missing-field flags must become reviewable without manual Hindi replacements.
- A partially translated paper must fall back field-by-field to English in Hindi UI without blank headings, options, solutions, or accessible names.
- Complete bilingual papers must still render Hindi and retain a bilingual label.
- English-only published papers must parse through storage, mock, practice, results, and analytics without weakening scoring or answer integrity.

---

### Task 1: Published localized-content contract and fallback helpers

**Files:**
- Modify: `src/features/exam/domain.ts`
- Create: `src/features/localization/localized-content.ts`
- Create: `src/features/localization/localized-content.test.ts`
- Modify: `src/features/papers/sample-papers.ts`

**Interfaces:**
- Consumes: existing `Locale`, `PaperVersion`, and localized paper fields.
- Produces: `LocalizedText` with required `en` and optional `hi`; `localizedContent(value, locale): string`; `isPaperBilingual(paper): boolean`; `PaperSummary.isBilingual: boolean`.

- [x] **Step 1: Write failing localized-content contract tests**

  Test that `PaperVersionSchema` accepts English-only title, section, stem, options, and solution; rejects any missing English value; `localizedContent({ en: "Force" }, "hi")` returns `"Force"`; and `isPaperBilingual()` is true only when every published localized field has non-empty Hindi.

- [x] **Step 2: Run the focused tests and verify RED**

  Run: `env -u LD_LIBRARY_PATH npm test -- src/features/localization/localized-content.test.ts`

  Expected: FAIL because Hindi is required and the helpers do not exist.

- [x] **Step 3: Implement the optional-Hindi domain boundary**

  Change `LocalizedTextSchema` to require `en` and accept optional `hi`. Add the two localization helpers without mutating paper data. Extend `PaperSummary` with `isBilingual`, setting existing sample fixtures to `true`.

- [x] **Step 4: Run the focused tests and verify GREEN**

  Run: `env -u LD_LIBRARY_PATH npm test -- src/features/localization/localized-content.test.ts`

  Expected: PASS.

- [x] **Step 5: Commit the domain contract**

  ```sh
  git add src/features/exam/domain.ts src/features/localization/localized-content.ts src/features/localization/localized-content.test.ts src/features/papers/sample-papers.ts
  git commit -m "feat: allow English-only paper content"
  ```

### Task 2: Import review and publication policy

**Files:**
- Modify: `src/features/imports/reconciliation.ts`
- Modify: `src/features/imports/providers.ts`
- Modify: `src/features/imports/server/import-review-service.ts`
- Modify: `src/features/imports/server/import-review-handlers.ts`
- Modify: `src/features/imports/workflow.test.ts`
- Modify: `src/features/imports/review-routes.test.ts`
- Modify: `src/features/imports/review-publication.test.ts`

**Interfaces:**
- Consumes: optional-Hindi `LocalizedText` and existing `ReconciledImport` records.
- Produces: `normalizeOptionalHindiReviewFlags(draft): ReconciledImport`; English-required `validateImportForPublish()`; English-only-safe `buildPaperVersionFromImport()`.

- [x] **Step 1: Write failing reconciliation and legacy-import tests**

  Replace the test that expects missing section Hindi to block. Assert that absent Hindi title, section title, stem, option text, and solution create no `missing_field` flags; missing English still blocks; translation confidence is not required when no Hindi content exists; and a stored draft with unresolved missing-field paths ending in `.hi` is normalized without altering other flags.

- [x] **Step 2: Write failing publication and route tests**

  Assert that a fully reviewed English-only import builds immutable original/current `PaperVersion` values without synthetic Hindi, and that GET/PATCH review responses for a legacy extracted import omit obsolete Hindi-missing flags while keeping `canPublish` false until all remaining admin/integrity flags are resolved.

- [x] **Step 3: Run the import tests and verify RED**

  Run: `env -u LD_LIBRARY_PATH npm test -- src/features/imports/workflow.test.ts src/features/imports/review-routes.test.ts src/features/imports/review-publication.test.ts`

  Expected: FAIL on current bilingual completeness rules and non-null Hindi publication assertions.

- [x] **Step 4: Implement English-required import validation**

  Remove Hindi paths from required-content collection, condition translation-confidence review on translated content actually being present, and add `normalizeOptionalHindiReviewFlags()` to prune only obsolete `missing_field` flags whose paths end in `.hi`. Apply normalization when loading/reviewing legacy documents and calculate review readiness from the normalized document rather than stale stored status alone.

- [x] **Step 5: Build published versions without invented translations**

  Preserve `hi` only when a reviewed Hindi value exists for titles, sections, stems, options, and solutions. Keep English non-null assertions and every existing structural, answer-key, admin-review, and immutability validation.

- [x] **Step 6: Update provider extraction instructions**

  Require complete English extraction, request Hindi when present in the source, and prohibit inventing Hindi solely to satisfy publication.

- [x] **Step 7: Run the import tests and verify GREEN**

  Run: `env -u LD_LIBRARY_PATH npm test -- src/features/imports/workflow.test.ts src/features/imports/review-routes.test.ts src/features/imports/review-publication.test.ts`

  Expected: PASS.

- [x] **Step 8: Commit the review policy**

  ```sh
  git add src/features/imports/reconciliation.ts src/features/imports/providers.ts src/features/imports/server/import-review-service.ts src/features/imports/server/import-review-handlers.ts src/features/imports/workflow.test.ts src/features/imports/review-routes.test.ts src/features/imports/review-publication.test.ts
  git commit -m "feat: make Hindi optional in reviewed imports"
  ```

### Task 3: Student UI fallback and accurate language labels

**Files:**
- Modify: `src/features/papers/paper-card.tsx`
- Modify: `src/features/papers/published-paper-details.tsx`
- Modify: `src/features/papers/server/published-paper-store.ts`
- Modify: `src/features/localization/messages.ts`
- Modify: `src/app/papers/[paperId]/page.tsx`
- Modify: `src/features/exam/exam-workspace.tsx`
- Modify: `src/features/analytics/analytics-workspace.tsx`
- Modify: `src/features/landing/landing-page.test.tsx`
- Modify: `src/features/papers/published-paper-store.test.ts`
- Modify: `src/app/papers/published-paper-pages.test.tsx`
- Modify: `src/features/exam/exam-workspace.test.tsx`
- Modify: `src/features/analytics/analytics-workspace.test.tsx`

**Interfaces:**
- Consumes: `localizedContent()`, `isPaperBilingual()`, optional Hindi paper fields.
- Produces: field-level English fallback in Hindi UI and truthful English/bilingual metadata across library, detail, exam, and analytics screens.

- [x] **Step 1: Write failing UI and storage tests**

  Add an English-only published row and assert it parses into the library with `isBilingual: false`. Under Hindi locale, assert paper title, section, question, option, solution, result review, and history labels fall back to English. Assert complete bilingual fixtures still show Hindi. Assert landing-library and detail metadata says localized “English paper” rather than bilingual when `isBilingual` is false.

- [x] **Step 2: Run the focused UI tests and verify RED**

  Run: `env -u LD_LIBRARY_PATH npm test -- src/features/papers/published-paper-store.test.ts src/features/landing/landing-page.test.tsx src/app/papers/published-paper-pages.test.tsx src/features/exam/exam-workspace.test.tsx src/features/analytics/analytics-workspace.test.tsx`

  Expected: FAIL because components directly index optional Hindi values and all papers are labelled bilingual.

- [x] **Step 3: Replace direct localized-field indexing**

  Use `localizedContent()` for paper, section, question, option, and solution content in paper cards, details, exam workspace, and analytics workspace. Derive and pass `isBilingual` at server serialization boundaries without passing full non-serializable paper objects.

- [x] **Step 4: Render accurate language metadata**

  Add localized English/Hindi message keys for “English paper”. Keep the application language toggle available, but show that metadata for incomplete/absent Hindi content and the existing bilingual metadata only when `isPaperBilingual()` returns true.

- [x] **Step 5: Run the focused UI tests and verify GREEN**

  Run: `env -u LD_LIBRARY_PATH npm test -- src/features/papers/published-paper-store.test.ts src/features/landing/landing-page.test.tsx src/app/papers/published-paper-pages.test.tsx src/features/exam/exam-workspace.test.tsx src/features/analytics/analytics-workspace.test.tsx`

  Expected: PASS.

- [x] **Step 6: Commit the UI fallback**

  ```sh
  git add src/features/papers src/app/papers src/features/exam/exam-workspace.tsx src/features/exam/exam-workspace.test.tsx src/features/analytics/analytics-workspace.tsx src/features/analytics/analytics-workspace.test.tsx
  git commit -m "feat: fall back to English paper content"
  ```

### Task 4: Product documentation and complete verification

**Files:**
- Modify: `docs/product/medmock-spec.md`
- Modify: `.superpowers/sdd/2026-10-28-medmock-mvp/progress.md`
- Modify: `docs/PROJECT_HANDOFF.md`

**Interfaces:**
- Consumes: completed optional-Hindi implementation and verification evidence.
- Produces: updated binding requirements and exact continuation evidence.

- [x] **Step 1: Amend the product requirement**

  State that the application UI remains fully English/Hindi, English paper content is mandatory, Hindi paper content is optional, provided Hindi must remain reviewable, and Hindi UI falls back to English paper content when translations are absent.

- [x] **Step 2: Run all unchanged-source gates**

  Run:

  ```sh
  env -u LD_LIBRARY_PATH npm test
  env -u LD_LIBRARY_PATH npm run lint
  env -u LD_LIBRARY_PATH npm run typecheck
  env -u LD_LIBRARY_PATH npm run build
  ```

  Expected: all unit/component tests pass; lint and type-check exit 0; production build exits 0.

- [x] **Step 3: Record evidence and residual browser limitation**

  Append RED/GREEN commands, final counts, lint/type-check/build results, and the existing Android Playwright limitation to the progress ledger and handoff. Do not mark Task 6 complete or production-ready.

- [x] **Step 4: Commit documentation and verification evidence**

  ```sh
  git add docs/product/medmock-spec.md .superpowers/sdd/2026-10-28-medmock-mvp/progress.md docs/PROJECT_HANDOFF.md
  git commit -m "docs: allow reviewed English-only papers"
  ```

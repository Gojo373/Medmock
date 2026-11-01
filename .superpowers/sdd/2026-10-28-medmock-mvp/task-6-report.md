# Task 6 final delta report — 2026-11-01

Status: DONE_WITH_CONCERNS — implementation complete locally; required external/browser gates remain blocked.
Task 6 remains open until required browser and external production validations pass.
Branch: `feat/medmock-mvp`. Starting HEAD: `fcc6c29`.
Commit subject: `fix: finish provider controls and bilingual student flows`.
No deployment, publication, push, external auth changes, or irreversible external writes occurred.

## Implementation

- Preserved the in-progress AgentRouter removal. Current extraction/provider schemas accept only OpenAI, Gemini, or both; historical AgentRouter migration remains in sequence, and `202610300003_disable_agentrouter_provider.sql` removes its final database constraint.
- OpenAI requires a configured key and exact `OPENAI_IMPORTS_ENABLED=true`. Gemini remains the enabled default with `gemini-3.8-flash`; OpenAI retains `gpt-5-mini` as its default when opted in.
- The admin imports Server Component requires authenticated admin access and passes only enabled providers. Empty provider configuration now announces the problem and prevents extraction even after a source is selected.
- One root LocaleProvider owns English/Hindi across landing, sign-in, public paper details, exam, import/review, dashboard/loading/error, and theme controls. The external-store snapshot preserves hydration consistency and persists the locale through route changes/remounts. Document `lang`, Hindi accessible names, and explicit per-language spans for bilingual review content are implemented. Storage refusal falls back to state without breaking language switching.
- Cumulative timing is now independent of selected answers. Optional `timeSpentByQuestionMs` fields remain compatible with legacy attempts/results; memory and persistent finalization derive cumulative maxima from all timing/clear/answer events and persist them in result JSON. Dashboard reconstruction, total time, subject/topic time, visited-question average pace, and fastest/slowest pace include cleared and ultimately unanswered questions. Answered-question pace still describes answered questions, and score/answer semantics stay intact.
- Mobile navigation is an accessible disclosure with expanded/control metadata, Escape closure and focus restoration, and close-on-selection. Admin controls target implemented import/library/personal-history destinations, with a current-import review link when available; unsupported admin destination controls were removed. Review has a return link.
- History controls select a previous attempt and update its score, solutions, and analytics. Rankings for another paper are withheld with an explanation until the latest loaded paper is selected, preventing mismatched ranking data.
- Self-review found that the new localized public-detail Client Component initially received a full reviewed PaperVersion. A separate observed RED regression narrowed the props to id, paperId, bilingual title, duration, and question count.
- Added a reusable read-only validation script and documented provider opt-in, migration order, staging SQL prerequisites, and Linux browser fixtures. `AGENTS.md` is untouched and excluded from staging/commit.

## TDD evidence

1. Preserved provider delta baseline:
   `env -u LD_LIBRARY_PATH npm test -- src/features/imports/provider-runtime-registry.test.ts src/features/imports/provider-clients.test.ts src/features/imports/import-processing.test.ts src/features/imports/admin-import-workspace.test.tsx src/app/admin/imports/admin-imports-page.test.tsx src/features/imports/workflow.test.ts`
   → 6 files / 33 tests passed. Existing follow-up changes were already GREEN when this continuation began; no new RED is claimed for inherited implementation.

2. Shared locale:
   `env -u LD_LIBRARY_PATH npm test -- src/features/localization/locale-provider.test.tsx`
   → observed RED: 6/6 failed, including unchanged document language, per-screen English state, and untranslated accessible names.
   After shared ownership, focused combined verification:
   `env -u LD_LIBRARY_PATH npm test -- src/features/localization/locale-provider.test.tsx src/features/landing/landing-page.test.tsx src/features/exam/exam-workspace.test.tsx src/features/analytics/analytics-workspace.test.tsx src/features/imports/admin-import-workspace.test.tsx src/features/imports/admin-import-review.test.tsx`
   → 6 files / 32 tests passed at that checkpoint.

3. Public detail Hindi:
   `env -u LD_LIBRARY_PATH npm test -- src/app/papers/published-paper-pages.test.tsx -t 'shared Hindi locale'`
   → observed RED: Hindi heading missing, 1 failed / 3 skipped.
   `env -u LD_LIBRARY_PATH npm test -- src/app/papers/published-paper-pages.test.tsx`
   → GREEN: 1 file / 4 tests passed.

4. Cleared/unanswered timing:
   `env -u LD_LIBRARY_PATH npm test -- src/features/analytics/analytics.test.ts src/features/exam/persistent-attempt-adapter.test.ts`
   → observed RED: 3 failed / 5 passed; the schema rejected the timing map, the dashboard omitted it, and persistent finalization lost it.
   `env -u LD_LIBRARY_PATH npm test -- src/features/analytics/analytics.test.ts src/features/exam/persistent-attempt-adapter.test.ts src/features/exam/attempt-api.test.ts src/features/exam/session.test.ts src/features/exam/scoring.test.ts`
   → GREEN: 5 files / 36 tests passed. The persistent test was subsequently split to retain original score/concurrency coverage and separately cover cumulative timing.

5. Mobile/admin/history navigation:
   `env -u LD_LIBRARY_PATH npm test -- src/features/landing/landing-page.test.tsx src/features/imports/admin-import-workspace.test.tsx src/features/analytics/analytics-workspace.test.tsx -t 'mobile navigation|implemented import|prior attempt'`
   → observed RED: 3 failed / 16 skipped, missing disclosure metadata, implemented destination links, and history controls.
   `env -u LD_LIBRARY_PATH npm test -- src/features/landing/landing-page.test.tsx src/features/imports/admin-import-workspace.test.tsx src/features/analytics/analytics-workspace.test.tsx`
   → GREEN: 3 files / 19 tests passed.

6. Empty provider configuration:
   `env -u LD_LIBRARY_PATH npm test -- src/features/imports/admin-import-workspace.test.tsx -t 'no provider'`
   → observed RED twice, including after selecting a file: no status was announced and extraction remained available.
   Review return link:
   `env -u LD_LIBRARY_PATH npm test -- src/features/imports/admin-import-review.test.tsx -t 'return link'`
   → observed RED: missing return link, 1 failed / 5 skipped.
   Combined GREEN:
   `env -u LD_LIBRARY_PATH npm test -- src/features/imports/admin-import-workspace.test.tsx src/features/imports/admin-import-review.test.tsx src/features/imports/provider-runtime-registry.test.ts`
   → 3 files / 13 tests passed. One intervening run exposed an outdated text query after adding explicit bilingual spans; the test now verifies content and each span's language.

7. Storage refusal:
   `env -u LD_LIBRARY_PATH npm test -- src/features/localization/locale-provider.test.tsx -t 'refuses preference'`
   → observed RED: document stayed English after a quota-refused write.
   `env -u LD_LIBRARY_PATH npm test -- src/features/localization/locale-provider.test.tsx`
   → GREEN: 1 file / 7 tests passed.

8. Public detail serialization:
   `env -u LD_LIBRARY_PATH npm test -- src/app/papers/published-paper-pages.test.tsx -t 'only paper-summary'`
   → observed RED: full question/answer/solution data appeared in detail client props.
   `env -u LD_LIBRARY_PATH npm test -- src/app/papers/published-paper-pages.test.tsx`
   → GREEN: 1 file / 5 tests passed.

## Final verification

Final unchanged-source gate results:

| Command | Result |
| --- | --- |
| `env -u LD_LIBRARY_PATH npm test` | Exit 0; 29 files / 135 tests passed in 190.10s. |
| `env -u LD_LIBRARY_PATH npm run lint` | Exit 0. |
| `env -u LD_LIBRARY_PATH npm run typecheck` | Exit 0. |
| `env -u LD_LIBRARY_PATH npm run build` | Exit 0; Next 16.4.3 webpack compilation succeeded, TypeScript passed, 14/14 pages generated, all dynamic routes and Proxy compiled. |
| `env -u LD_LIBRARY_PATH npm run test:e2e` | Exit 1 before discovery; Android unsupported. |
| `git diff --check` | Clean. |

The first full run also passed 29 files / 135 tests (309.05s). Because the public-detail summary fix landed while that run was in progress, a fresh unchanged-source full run was completed and passed before committing.

The final e2e command reported:
`Error: Unsupported platform: android` (Playwright registry initialization, Node v24.22.1).
No browser or axe pass is claimed.

## External validation

Executed:
`env -u LD_LIBRARY_PATH node .superpowers/validation/read-only-check.mjs`

The final run returned:
- `configured_import_providers=gemini`.
- Supabase auth settings HTTP 200; email enabled, Google disabled.
- Anonymous published-paper read HTTP 200; no published fixture present.
- Private `paper-imports` bucket HTTP 200 and private.
- Legacy AgentRouter jobs read HTTP 200; no matching rows currently present.
- OpenAI model access HTTP 200; Gemini model access HTTP 200.
- No SQL connection configured; rollback-only SQL blocked at connection preflight.
- Live extraction not run because that script uploads files and uses billable generation, outside the allowed read-only/rollback-only validation scope.

The first diagnostic run incorrectly used the anonymous key in the admin API-key header and reported storage HTTP 400 / job HTTP 401. Correcting the diagnostic to use the service key in both admin headers produced the healthy results above; this was a diagnostic issue, not an application server-client defect.

Environment names/presence only:
- PRESENT: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SITE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, OPENAI_IMPORT_MODEL, OPENAI_IMPORTS_ENABLED, GEMINI_API_KEY, GEMINI_IMPORT_MODEL, IMPORT_WORKER_SECRET, CRON_SECRET, E2E_AUTH_STORAGE_STATE.
- PLACEHOLDER: E2E_PUBLISHED_PAPER_ID, E2E_PUBLISHED_VERSION_ID.
- ABSENT: SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, SUPABASE_DB_URL, DATABASE_URL, SUPABASE_DB_PASSWORD, VERCEL_TOKEN, VERCEL_PROJECT_ID, VERCEL_ORG_ID.
- The E2E_AUTH_STORAGE_STATE file is absent. No secret values, URLs, user IDs, private source names, or provider keys were printed.

Inspected existing `.superpowers/validation/rls-smoke.sql`: it begins a transaction and ends with rollback, but could not be rerun without SQL/management credentials. The historical 2026-10-30 rollback-only staging smoke and real Gemini bilingual PDF success remain recorded evidence, not fresh execution of this delta. Historical OpenAI quota exhaustion is not revalidated by a read-only model access check.

## Self-review and concerns

- Reviewed changed boundaries only: provider enablement/removal, authenticated admin entry, shared locale/hydration/storage behavior, cumulative timing/scoring/finalization, disclosure/history controls, summary-only public props, and validation privacy. No whole-repository re-audit or delegation occurred.
- Preserved immutable publication, admin approval, official key provenance, strict-mock answer redaction, server-authoritative timing, ownership checks, replay idempotency, and privacy constraints.
- Task 6 is not complete: Android cannot run Playwright/axe; authenticated Linux fixtures and published staging content are missing.
- The final AgentRouter-removal migration is not applied or transactionally validated in this session. Fresh RLS/append/finalize/concurrency validation requires staging SQL credentials.
- Google/email deployment journeys, rotated cookies, deployed signed uploads/cron, Vercel settings, representative provider PDF/image imports, and 500-concurrent-attempt load proof remain external. No deployment or load proof is claimed.
- OpenAI is intentionally disabled. Its previously exhausted quota is relevant only if someone explicitly enables that provider.
- UI source topic/subject keys and JSON remain explicitly English where the stored schema supplies machine identifiers, while bilingual text spans retain accurate language metadata.
- When preference storage is refused, the selected language survives route changes under the root provider but cannot be persisted through a full browser reload.

## Files changed

- `.env.example`
- `README.md`
- `docs/superpowers/plans/2026-10-28-medmock-mvp.md`
- `src/app/admin/imports/page.tsx`
- `src/app/globals.css`
- `src/app/layout.tsx`
- `src/app/page.tsx`
- `src/app/papers/[paperId]/page.tsx`
- `src/app/papers/published-paper-pages.test.tsx`
- `src/app/sign-in/page.tsx`
- `src/components/theme/theme-toggle.tsx`
- `src/components/ui/button.tsx`
- `src/features/analytics/analytics-workspace.css`
- `src/features/analytics/analytics-workspace.test.tsx`
- `src/features/analytics/analytics-workspace.tsx`
- `src/features/analytics/analytics.test.ts`
- `src/features/analytics/analytics.ts`
- `src/features/exam/domain.ts`
- `src/features/exam/exam-workspace.test.tsx`
- `src/features/exam/exam-workspace.tsx`
- `src/features/exam/persistent-attempt-adapter.test.ts`
- `src/features/exam/scoring.ts`
- `src/features/exam/server/attempt-store.ts`
- `src/features/exam/session.ts`
- `src/features/imports/admin-import-review.test.tsx`
- `src/features/imports/admin-import-review.tsx`
- `src/features/imports/admin-import-workspace.test.tsx`
- `src/features/imports/admin-import-workspace.tsx`
- `src/features/imports/import-processing.test.ts`
- `src/features/imports/provider-clients.test.ts`
- `src/features/imports/provider-runtime-registry.test.ts`
- `src/features/imports/providers.ts`
- `src/features/imports/schema.ts`
- `src/features/imports/server/import-processor.ts`
- `src/features/imports/server/provider-clients.ts`
- `src/features/imports/server/provider-runtime-registry.ts`
- `src/features/imports/workflow.test.ts`
- `src/features/landing/landing-page.test.tsx`
- `src/features/landing/landing-page.tsx`
- `src/features/localization/locale-provider.tsx`
- `src/test/setup.ts`
- `src/app/admin/imports/admin-imports-page.test.tsx`
- `src/features/auth/sign-in-shell.tsx`
- `src/features/localization/locale-provider.test.tsx`
- `src/features/papers/published-paper-details.tsx`
- `src/test/render.tsx`
- `supabase/migrations/202610300003_disable_agentrouter_provider.sql`
- `docs/PROJECT_HANDOFF.md`
- `.superpowers/sdd/2026-10-28-medmock-mvp/progress.md`
- `.superpowers/sdd/2026-10-28-medmock-mvp/task-6-report.md`
- `.superpowers/validation/read-only-check.mjs`

## Spec review follow-up — loaded review language/accessibility

The single remaining spec-review locale finding is fixed. Human explanations
are selected from an exhaustive English/Hindi map keyed by the five stable
ReviewFlag codes, with the paragraph language matching the selected UI locale.
Raw English server diagnostic messages are no longer used as explanatory UI.

Comparison text is annotated independently from the UI locale: scalar `.en`
and `.hi` fields have the appropriate `pre.lang`; structured JSON retains
its formatting while nested `en`/`hi` values receive individual language
spans, including bilingual solution/option structures. The underlying provider
values and review decision/publication behavior are unchanged.

Loaded-review regressions exercise English and Hindi UI states, all five flag
explanations, comparisons in the opposite language, and bilingual structured
values. No Next API or route convention changed; this is a feature-local React
rendering change. No subagents or external writes were used; AGENTS.md was not
touched.

### Observed RED

Command (DEBUG_PRINT_LIMIT only suppresses diagnostic DOM dumps):

```sh
env -u LD_LIBRARY_PATH DEBUG_PRINT_LIMIT=0 npm test -- src/features/imports/admin-import-review.test.tsx -t 'loaded-review'
```

Exit 1. Exact console output:

```text
> medmock@0.1.0 test
> vitest run src/features/imports/admin-import-review.test.tsx -t loaded-review


 RUN  v5.0.5 /data/data/com.termux/files/home/projects/neet

 ❯ src/features/imports/admin-import-review.test.tsx (10 tests | 4 failed | 6 skipped) 2783ms
   ❯ AdminImportReview (10)
     × annotates loaded-review comparisons independently of the en UI language 498ms
     × annotates loaded-review comparisons independently of the hi UI language 153ms
     × localizes loaded-review explanations in en and retains each comparison field language 1052ms
     × localizes loaded-review explanations in hi and retains each comparison field language 1061ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/features/imports/admin-import-review.test.tsx > AdminImportReview > annotates loaded-review comparisons independently of the en UI language
Error: expect(element).toHaveAttribute("lang", "hi") // element.getAttribute("lang") === "hi"

Expected the element to have attribute:
  lang="hi"
Received:
  null
 ❯ src/features/imports/admin-import-review.test.tsx:56:77
     54|     });
     55|     const oppositeLanguageValue = locale === "en" ? "OpenAI का हिंदी प…
     56|     expect((await screen.findByText(oppositeLanguageValue)).closest("p…
       |                                                                             ^
     57|     expect(screen.getByText('"English solution draft"')).toHaveAttribu…
     58|     expect(screen.getByText('"हिंदी समाधान प्रारूप"')).toHaveAttribute…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  src/features/imports/admin-import-review.test.tsx > AdminImportReview > annotates loaded-review comparisons independently of the hi UI language
Error: expect(element).toHaveAttribute("lang", "en") // element.getAttribute("lang") === "en"

Expected the element to have attribute:
  lang="en"
Received:
  null
 ❯ src/features/imports/admin-import-review.test.tsx:56:77
     54|     });
     55|     const oppositeLanguageValue = locale === "en" ? "OpenAI का हिंदी प…
     56|     expect((await screen.findByText(oppositeLanguageValue)).closest("p…
       |                                                                             ^
     57|     expect(screen.getByText('"English solution draft"')).toHaveAttribu…
     58|     expect(screen.getByText('"हिंदी समाधान प्रारूप"')).toHaveAttribute…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  src/features/imports/admin-import-review.test.tsx > AdminImportReview > localizes loaded-review explanations in en and retains each comparison field language
TestingLibraryElementError: Unable to find an element with the text: An admin must review and approve every extracted question.. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.

Ignored nodes: comments, script, style
...

Ignored nodes: comments, script, style
...
 ❯ waitForWrapper node_modules/@testing-library/dom/dist/wait-for.js:163:27
 ❯ node_modules/@testing-library/dom/dist/query-helpers.js:86:33
 ❯ src/features/imports/admin-import-review.test.tsx:103:44
    101|
    102|     for (const explanation of explanations) {
    103|       for (const paragraph of await screen.findAllByText(explanation))…
       |                                            ^
    104|         expect(paragraph).toHaveAttribute("lang", locale);
    105|       }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  src/features/imports/admin-import-review.test.tsx > AdminImportReview > localizes loaded-review explanations in hi and retains each comparison field language
TestingLibraryElementError: Unable to find an element with the text: एडमिन को हर निकाले गए प्रश्न की समीक्षा और स्वीकृति देनी होगी।. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.

Ignored nodes: comments, script, style
...

Ignored nodes: comments, script, style
...
 ❯ waitForWrapper node_modules/@testing-library/dom/dist/wait-for.js:163:27
 ❯ node_modules/@testing-library/dom/dist/query-helpers.js:86:33
 ❯ src/features/imports/admin-import-review.test.tsx:103:44
    101|
    102|     for (const explanation of explanations) {
    103|       for (const paragraph of await screen.findAllByText(explanation))…
       |                                            ^
    104|         expect(paragraph).toHaveAttribute("lang", locale);
    105|       }

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  1 failed (1)
      Tests  4 failed | 6 skipped (10)
   Start at  10:17:38
   Duration  24.30s (environment 55%, import 21%, tests 13%, setup 5%, transform 4%, worker 2%)
```

### Focused GREEN

```sh
env -u LD_LIBRARY_PATH npm test -- src/features/imports/admin-import-review.test.tsx src/features/localization/locale-provider.test.tsx
```

Exit 0. Exact console output:

```text
> medmock@0.1.0 test
> vitest run src/features/imports/admin-import-review.test.tsx src/features/localization/locale-provider.test.tsx


 RUN  v5.0.5 /data/data/com.termux/files/home/projects/neet


 Test Files  2 passed (2)
      Tests  17 passed (17)
   Start at  10:19:48
   Duration  45.02s (tests 50%, environment 25%, import 18%, transform 3%, setup 3%)

Environment  jsdom was created 2 times · 10.27s total, 25% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments
```

### Additional verification

```sh
env -u LD_LIBRARY_PATH npm run typecheck
```

Exit 0. Exact console output:

```text
> medmock@0.1.0 typecheck
> tsc --noEmit
```

```sh
env -u LD_LIBRARY_PATH npm run lint
```

Exit 0. Exact console output:

```text
> medmock@0.1.0 lint
> eslint .
```

Full-suite GREEN:

```sh
env -u LD_LIBRARY_PATH npm test
```

Exit 0. Exact final output:

```text
Test Files  29 passed (29)
      Tests  139 passed (139)
   Start at  10:21:18
   Duration  316.20s (environment 64%, import 14%, tests 13%, setup 7%, worker 1%, transform 1%)

Environment  jsdom was created 29 times · 167.40s total, 64% of tracked time
             create it once per worker with pool: 'vmThreads' (keeps per-file isolation) or isolate: false (shares it across files)
             learn more: https://vitest.dev/guide/improving-performance#test-environments
```

The earlier full-project build/browser evidence above belongs to the base
commit and is not claimed as a fresh build or browser execution for this
targeted UI follow-up.

Self-review: the code-keyed explanation map is checked against every supported
flag code; comparison rendering escapes text through React and leaves provider
values untouched. Decision persistence and explicit publication approval remain
covered by the focused suite. Existing Task 6 external/browser blockers remain
unchanged; Task 6 is not marked complete.

Files changed in this follow-up: `src/features/imports/admin-import-review.tsx`,
`src/features/imports/admin-import-review.test.tsx`, this report, and the
progress ledger. Commit subject: `fix: localize loaded import review explanations`.

## Final whole-branch fix wave — 2026-11-01

Scope: the complete queue in `final-fix-findings-2026-11-01.md` against
`3309bb8`: 2 Critical, 6 Important, 3 Minor. All eleven findings were accepted
and implemented locally. No subagents, external writes, deployment, publication,
auth changes, billable provider requests, or database changes were performed.
`AGENTS.md` is untouched. Task 6 remains open for the existing external gates.

### Per-finding RED → GREEN evidence

1. **Integral server clock (Critical).**
   `env -u LD_LIBRARY_PATH npm test -- src/features/exam/client-attempt.test.ts`
   first exited 1 because the required clock/synchronization boundary was absent;
   after implementation, 1/1 passed. The regression uses a 101 ms round trip and
   validates the generated answer against the production event schema during
   synchronization. The browser now uses the rounded shared clock offset.
   A later legacy-snapshot regression also reproduced persisted `.5` timestamps,
   durations, and entry times; all are normalized to integral milliseconds.
2. **Terminal expiry synchronization (Critical).** The same focused command
   next produced 4 failures / 1 pass: repeated finalizing ticks appended events,
   and explicit rejected/submitted/blocked outcomes were absent. Expiry freezes
   its event set once. The sync controller preserves rejected late events in a
   saved snapshot before removing them from its pending queue, acknowledges
   accepted/duplicate events, caches permanent failures, and recovers submitted
   results through the idempotent submit endpoint. Unexpected no-progress replies
   cannot produce an unbounded drain loop. Late receipts never modify server
   scoring rules; bilingual UI explains that results use accepted server answers.
3. **Local identity (Important).**
   `env -u LD_LIBRARY_PATH npm test -- src/features/exam/recovery.test.ts`
   produced 1 failure / 4 passes because the shared local-ID predicate was absent.
   Generated `local:` and legacy `local-` identities now share one predicate,
   and submission connects/rebinds first and reads the current server ID.
   Findings 1–3 then passed together with:
   `env -u LD_LIBRARY_PATH npm test -- src/features/exam/client-attempt.test.ts src/features/exam/persistence.test.ts src/features/exam/recovery.test.ts src/features/exam/session.test.ts`
   → 4 files / 21 tests passed (26.97s).
4. **Review editor consistency (Important).**
   `env -u LD_LIBRARY_PATH DEBUG_PRINT_LIMIT=0 npm test -- src/features/imports/admin-import-review.test.tsx src/features/imports/workflow.test.ts -t 'consistent with decisions|reopens decisions'`
   → 3 failed / 30 skipped. Clean editors now track saved decisions. Dirty
   editors retain their text and show a bilingual conflict notice; saving requires
   the explicit “Keep my edits for renewed review” action. Server edits reopen
   affected flags and the overall admin review, and publication requires saved
   content plus fresh approval. Concurrent decision/save controls are disabled.
5. **Sections (Important).**
   `env -u LD_LIBRARY_PATH npm test -- src/features/imports/workflow.test.ts -t 'section translations|structurally invalid'`
   → 3 failed / 21 skipped: null titles/translations rejected parsing and invalid
   section membership could publish. Null/blank section translations now become
   reviewable missing fields. Publication validates both translations, unique
   sections/questions, section membership/subject consistency, and selection
   limits. Legacy imports without explicit sections retain generated sections.
6. **Backed official keys (Important).**
   `env -u LD_LIBRARY_PATH npm test -- src/features/imports/import-processing.test.ts`
   → 4 failed / 4 passed. Raw model provenance now normalizes to `provider`.
   Only entries backed by the separately uploaded answer-key attachment enter
   the canonical official-key map, regardless of which provider extracted them.
   Conflicting official extractions retain an unresolved error flag and do not
   acquire official provenance. Provider suggestions are not promoted.
   Findings 4–6 passed with:
   `env -u LD_LIBRARY_PATH npm test -- src/features/imports/import-processing.test.ts src/features/imports/workflow.test.ts src/features/imports/admin-import-review.test.tsx`
   → 3 files / 44 tests passed (54.34s).
7. **Production browser prerequisites (Important).**
   `env -u LD_LIBRARY_PATH npm test -- src/test/browser-fixtures.test.ts`
   first exited 1 at the missing fixture-validation module, then passed 2/2
   (13.74s). Fixtures reject absent state files and placeholder publication IDs.
   Playwright now defines real published mock answer/reload/offline reconnect/
   submit/result journeys, practice reveal/locking/reload, correct unauthenticated
   version destinations, protected dashboard axe, and optional authenticated
   admin/review axe. Actual URL, status, and screen assertions prevent redirects
   or 404s from passing. The suite uses the production server after build or an
   explicit staging base URL. Linux execution remains required.
8. **Denied storage (Important).**
   `env -u LD_LIBRARY_PATH DEBUG_PRINT_LIMIT=0 npm test -- src/features/localization/locale-provider.test.tsx -t 'all browser'`
   → 2 failed / 7 skipped, at theme and exam generation reads. Guarded preference
   read/write/remove helpers now provide an in-memory fallback; both complete
   screens and theme toggling work when all localStorage operations throw.
9. **Hindi fallbacks (Minor).**
   `env -u LD_LIBRARY_PATH DEBUG_PRINT_LIMIT=0 npm test -- src/app/fallback-screens.test.tsx`
   → 3 failed, including both English-only fallback/accessibility checks. Root
   error and not-found screens now consume the shared locale and translate text,
   home/library links, and Retry. An initial test harness import/nested-provider
   error was corrected before the behavioral RED was recorded.
10. **Auth return destination (Minor).**
    `env -u LD_LIBRARY_PATH DEBUG_PRINT_LIMIT=0 npm test -- src/app/api/auth/return-destination.test.ts src/features/auth/auth-panel.test.tsx`
    → 4 failed / 1 passed. The sign-in page forwards validated `next` through the
    shell/panel into both Google and OTP callbacks. A shared internal-destination
    validator rejects external, scheme-relative, backslash, and control-character
    redirects; failed auth redirects retain the validated return destination.
11. **Refetch retry (Minor).** The fallback command above also demonstrated a
    transient loader never being called again. Root error now uses installed
    Next 16 `retry`, which refetches and rerenders; the regression resolves the
    second loader call and replaces the fallback. `error` is safely narrowed from
    `unknown`. Installed error/not-found/redirect/Playwright docs were read.
    Findings 8–11 passed with:
    `env -u LD_LIBRARY_PATH npm test -- src/app/fallback-screens.test.tsx src/features/localization/locale-provider.test.tsx src/app/api/auth/return-destination.test.ts src/features/auth/auth-panel.test.tsx src/app/api/auth/callback/route.test.ts`
    → 5 files / 18 tests passed (40.93s).

### Self-review and additional production evidence

- A production API/controller regression accepts one answer, reconnects after
  the 30-second receipt grace with a duplicate plus a new late answer, preserves
  the rejected event, and finalizes the unchanged accepted score. A second
  controller then receives `attempt_submitted` and recovers the identical result
  without discarding pending evidence. Command:
  `env -u LD_LIBRARY_PATH npm test -- src/features/exam/attempt-api.test.ts src/features/exam/client-attempt.test.ts src/features/exam/recovery.test.ts`
  → 3 files / 22 tests passed (24.51s).
- A production-hook component test bypasses the normal test-only short circuit
  explicitly, replacing only storage and HTTP boundaries. It verifies failed
  initial creation → local answer → confirmation → server-ID submission. Its
  lost-acknowledgement case first failed with `Repeated terminal sync loop`;
  guarding the transition to finalizing fixed the loop while retaining pending
  local evidence. `env -u LD_LIBRARY_PATH DEBUG_PRINT_LIMIT=0 npm test -- src/features/exam/workspace-sync.test.tsx`
  → initial 1 failed / 1 passed.
- `env -u LD_LIBRARY_PATH npm test -- src/features/exam/persistence.test.ts src/features/imports/workflow.test.ts -t 'legacy fractional|earlier decisions'`
  → 2 failed / 27 skipped. Legacy fractional recovery and invalidating earlier
  decisions after later review changes were then fixed.
- Combined refinement GREEN:
  `env -u LD_LIBRARY_PATH npm test -- src/features/exam/workspace-sync.test.tsx src/features/exam/persistence.test.ts src/features/imports/workflow.test.ts`
  → 3 files / 31 tests passed (33.68s).
- Self-review added reconnection draining after a previously successful initial
  connection, checked mobile hidden-palette assertions and exact browser labels,
  and made privacy browser checks wait for their persisted server response.
- An intermediate type-check caught test fixture narrowing and an obsolete
  submitted-state comparison; an intermediate lint caught ref access during
  render and an unnecessary callback dependency. These were corrected before
  the final gates. The full final gate evidence is recorded below.

### Final unchanged-source verification

All final commands ran against the finished application/test source. Subsequent
changes only record these results in the report, ledger, handoff, and plan.

```text
env -u LD_LIBRARY_PATH npm test
→ exit 0
  Test Files  34 passed (34)
       Tests  171 passed (171)
    Duration  392.31s

env -u LD_LIBRARY_PATH npm run lint
→ exit 0; no errors or warnings

env -u LD_LIBRARY_PATH npm run typecheck
→ exit 0

env -u LD_LIBRARY_PATH npm run build
→ exit 0; Next.js 16.4.3 webpack
  Compiled successfully in 81s
  Finished TypeScript in 69s
  Generated static pages 14/14
  All dynamic routes and Proxy compiled; sign-in now reads its return destination.

env -u LD_LIBRARY_PATH npm run test:e2e
→ exit 1 before test discovery
  Error: Unsupported platform: android
      at computeDefaultCacheDirectory (node_modules/playwright-core/lib/coreBundle.js:34016:9)
      at defaultCacheDirectory (node_modules/playwright-core/lib/coreBundle.js:34019:37)
      at defaultRegistryDirectory (node_modules/playwright-core/lib/coreBundle.js:34022:37)
  Node.js v24.22.1

git diff --check
→ exit 0
```

Self-review outcome: all eleven locally actionable queue items are addressed;
no local test/lint/type/build failures remain. The extra production-hook check
also closed the transient terminal-state render loop discovered in this wave.
Preserved invariants include bilingual UI/accessibility, immutable publication,
explicit admin approval, backed official-key precedence, attempt idempotency,
server deadlines, accepted-state scoring, and ranking/privacy policy.

Residual concerns: actual Linux authenticated browser/axe execution remains
unverified. The previously documented staging SQL/RLS/final provider-removal
migration, deployed auth/cookie/upload/cron/Vercel checks, approved representative
provider extraction, and 500-concurrent-attempt load evidence are still required.
This wave did not rerun or mutate those external systems. Retained permanent
sync-conflict evidence stays on the user's device; no support/export workflow
was added. Task 6 and production readiness remain incomplete.

Commit subject: `fix: resolve final attempt and review integrity findings`.
`AGENTS.md` and private environment files are excluded.

## Scoped final re-review

The re-review confirmed all 11 original findings addressed and no new Critical
application breakage. It found one new Important issue: the admin Playwright/axe
journey requires the intentionally hidden paper-file input to be visible, so a
configured Linux run fails before protected admin axe coverage. It also found a
new Minor inconsistency: failed browser-storage mutations can be obscured by
stale readable localStorage values.

Per the single-wave final-review rule, no second fix wave was run. Both findings
are recorded with rulings in the progress ledger. Task 6 remains open.

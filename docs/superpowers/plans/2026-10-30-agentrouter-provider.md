# AgentRouter Import Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add AgentRouter as an independently selectable reviewed import provider without weakening MedMock’s bilingual review, privacy, or publication guarantees.

**Architecture:** AgentRouter uses its documented OpenAI-compatible `/v1/responses` boundary with inline base64 inputs because its supported endpoint list does not advertise `/v1/files`. PDFs are sent as `input_file`; JPG/PNG sources are sent as `input_image`. The existing strict extraction schema, nullable normalization, reconciliation, admin review, and immutable publication paths remain shared.

**Tech Stack:** Next.js 16, TypeScript, Vitest, Zod, AgentRouter Responses-compatible HTTP API.

**Spec:** `docs/product/medmock-spec.md`

## Global Constraints

- Imports never auto-publish; explicit admin review remains mandatory.
- Preserve English/Hindi content and reviewed solutions.
- Provider keys remain server-only.
- Do not route files through AgentRouter unless the admin explicitly selects it.
- Existing OpenAI and Gemini providers continue to work independently.

## Review Focus

- Image sources must use multimodal image input rather than a fake file identifier.
- PDF sources must retain filename/MIME metadata and use inline file data.
- Malformed or nullable output must enter the existing review workflow.
- Missing provider credentials must fail only jobs that select that provider.
- Large inline payloads must reject predictably before exhausting server memory.

---

### Task 1: AgentRouter provider contract and runtime

**Files:**
- Modify: `src/features/imports/schema.ts`
- Modify: `src/features/imports/providers.ts`
- Modify: `src/features/imports/server/provider-clients.ts`
- Test: `src/features/imports/provider-clients.test.ts`
- Test: `src/features/imports/workflow.test.ts`

**Interfaces:**
- Produces: `createAgentRouterExtractionProvider()` and `createAgentRouterProviderRuntime()`.
- Consumes: the existing strict extraction schema and provider normalization.

- [x] Write failing tests for Responses URL/auth, image `input_image`, PDF `input_file`, strict schema, and parsed bilingual output.
- [x] Run the focused tests and observe the missing-provider RED.
- [x] Implement the minimum AgentRouter provider/runtime with inline base64 files and a bounded input size.
- [x] Run focused tests GREEN.

### Task 2: Worker, admin UI, and configuration integration

**Files:**
- Modify: `src/features/imports/server/import-processor.ts`
- Modify: `src/app/api/internal/imports/process/route.ts`
- Modify: `src/features/imports/admin-import-workspace.tsx`
- Modify: `src/features/imports/admin-import-workspace.test.tsx`
- Modify: `src/features/imports/import-processing.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `ProviderSelection` and `ProviderRuntime`.
- Produces: independently optional OpenAI, Gemini, and AgentRouter runtimes.

- [x] Write failing tests selecting AgentRouter and allowing Gemini-only worker configuration.
- [x] Run focused tests and observe RED.
- [x] Add the admin selection, environment variables, optional runtime registry, and selected-provider validation.
- [x] Run focused tests GREEN.

### Task 3: Verification and live handoff

**Files:**
- Modify: `docs/PROJECT_HANDOFF.md`
- Modify: `.superpowers/sdd/2026-10-28-medmock-mvp/progress.md`

- [x] Run full tests, lint, type-check, and production build.
- [x] If `AGENT_ROUTER_API_KEY` exists, run a live bilingual PDF/image validation and record evidence; otherwise record the exact credential blocker.
- [x] Commit without `AGENTS.md` or `.env.local`.

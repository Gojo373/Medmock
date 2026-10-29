# MedMock

MedMock is a bilingual NEET paper-to-CBT platform for reviewed AI imports,
strict mock exams, immediate-feedback practice, analytics, and privacy-safe
first-attempt rankings.

> Practice the paper. Master the pressure.

MedMock is independent from NTA. Administrators must have the rights to every
paper, answer key, image, and solution they upload or publish.

## Stack

- Next.js App Router, React, TypeScript, Vitest, Testing Library, Playwright
- Supabase Auth, Postgres, Row Level Security, and private Storage
- OpenAI Responses and Google Gemini behind server-only provider adapters

## Local development

1. Use Node.js 22 or newer.
2. Copy `.env.example` to `.env.local` and fill in the project values.
3. Apply `supabase/migrations/202610290001_medmock_mvp.sql` to a Supabase project.
4. Promote exactly one profile to `role = 'admin'`; never expose the service
   role key to the browser.
5. Install and start the app:

   ```sh
   npm install
   npm run dev
   ```

The API accepts a Supabase access token as `Authorization: Bearer <token>`.
Import routes additionally require the authenticated user to have the admin
role in Supabase auth app metadata and the profiles table.

## Verification

```sh
npm test
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

On Termux, prefix Node/npm commands with `env -u LD_LIBRARY_PATH` if an
incompatible injected `libc++_shared.so` causes a startup error.

## Persistence and integrity

- Published paper revisions are protected from update or deletion by a
  database trigger.
- Attempt creation is idempotent per user and key.
- Answer events are append-only and deduplicated by attempt/event ID.
- Submission finalization is atomic and replay returns the first stored result.
- The server deadline decides expiry; client clocks are not authoritative.
- Attempts and results are owner-scoped by RLS.
- The leaderboard function exposes no user IDs and includes only first strict,
  public, submitted mocks with clear integrity. Hidden names remain anonymous.
- Percentiles remain provisional until 100 eligible first attempts exist.

## Deployment

Deploy the Next.js application to Vercel and configure all values from
`.env.example`. Apply migrations before serving traffic. Keep provider and
service-role keys in server-only environment variables, enable Supabase email
OTP/Google providers, and set their redirect URLs to `NEXT_PUBLIC_SITE_URL`.

The initial 10,000-user / 500-concurrent-attempt target is supported by:

- stateless application routes;
- Postgres uniqueness for idempotency and immutable append-only events;
- indexed active deadlines and leaderboard eligibility;
- client-side event buffering for temporary disconnection;
- horizontally scalable Supabase/Vercel services.

For larger exam windows, load-test attempt creation, event ingestion, and
deadline submission against a staging project, then size Supabase compute and
connection pooling from measured p95 latency rather than registered-user count.

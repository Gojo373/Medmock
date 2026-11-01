# MedMock Product Specification

MedMock is a production-ready NEET paper-to-CBT platform. A single admin uploads question papers, answer keys, and optional solution files as PDF/JPG/PNG, chooses OpenAI, Gemini, or both, reviews the structured extraction, and publishes immutable original-pattern and current-pattern test versions. English paper content is required; Hindi paper content is optional and remains reviewable when present.

Students sign in with Google or email OTP, use a fully English/Hindi responsive interface, take strict mock tests or immediate-feedback practice sessions, and receive reviewed solutions, personal analytics, a provisional live leaderboard, and percentile after 100 eligible first attempts.

The visual identity uses premium layered glass, aurora gradients, soft neumorphic controls, clay-like statistic cards, and restrained motion. Exam questions remain on solid high-contrast surfaces. Light mode is the exam default and dark mode is supported throughout. Accessibility target is WCAG 2.2 AA.

The managed stack is Next.js/TypeScript on Vercel with Supabase Postgres/Auth/Storage and durable background jobs. The initial capacity target is 10,000 registered users and 500 concurrent attempts.

Core constraints:

- Free public paper library; payments, cohorts, forums, and webcam proctoring are excluded.
- Single admin role for the first release.
- Imports never auto-publish.
- Official answer keys override model suggestions.
- Missing English content and solutions may be AI drafted but must be reviewed. Hindi paper translations are optional; Hindi application UI falls back field-by-field to reviewed English paper content when a translation is absent.
- Mock mode is timed, cannot pause, hides answers, and auto-submits.
- Practice mode locks the first choice and reveals the reviewed answer immediately.
- Attempts autosave locally, resynchronize after temporary disconnection, and use a server-authoritative deadline.
- Only the first strict mock is leaderboard-eligible; users may hide their display name.
- MedMock must state that it is not affiliated with NTA and that publishers need content rights.

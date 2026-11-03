# AICAP-2: Introduce the authenticated backend and keep all provider/database secrets server-only

Outcome

Introduce a persistent TypeScript HTTP/Socket.IO backend with a clear browser/server boundary. The Vite client receives public configuration only.

Acceptance criteria

OpenAI, Resend, Postgres credentials and Better Auth signing secrets are server runtime configuration; no secret is exposed through VITE_ variables, API responses, browser source maps, logs or cache artifacts.

Add explicit shared request/response validation and a reusable authenticated request context; return sanitized actionable errors without raw provider/internal details.

Enforce trusted origins for cookie-authenticated HTTP and Socket.IO requests; protect mutation endpoints and configure cookies/CSRF using Better Auth guidance.

Production refuses test auth bypass flags; development supports explicit isolated fixtures without live email/AI calls.

Ignore root/backend .env and secret variants while retaining safe .env.example files; provide a local development setup with Postgres and a test mail adapter.

Add a build check using sentinel test secrets to prove browser artifacts do not contain them.

Evidence

src/firebase.ts currently connects the browser directly to Firebase. omr-service/src/review.ts:91-95 already reads OpenAI secrets server-side and should retain that boundary. omr-service/src/server.ts:168-171 and review.ts:146-148 expose raw errors. Root .gitignore lacks .env/.env.* protection.

Dependencies

Foundation for account, persistence, invitations, socket and scan work. Do not deploy or provision infrastructure as part of planning.

Framework decision (2026-11-03)

Use TanStack Start for UI routing and server routes/functions, replacing the standalone Vite-client assumption above. Keep database access, Better Auth configuration, Resend and AI credentials in server-only modules. Retain a persistent Node runtime for Socket.IO; verify its hosting integration during implementation.

# ExpenseFlow

A premium, mobile-first, **offline-first** personal finance PWA. You can install it from the browser (no app store needed), add expenses offline, and have them sync automatically.

- **Frontend:** React 18 · TypeScript · Vite · Tailwind · shadcn/ui (Radix) · Framer Motion · Recharts · TanStack Query · Zustand · Dexie · Workbox
- **Backend:** Node 22 · Express · TypeScript · Drizzle ORM · Zod · Argon2id · pino
- **Database:** Neon serverless PostgreSQL (PGlite in-process for zero-setup local dev & tests)

Architecture, ERD, API design, auth flow and sync strategy: **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**

---

## Quick start (local)

Requirements: **Node ≥ 20.11** (22 recommended). No database install needed.

```bash
npm install
npm run dev            # API on :4000, web on :5173 (Vite proxies /api → API)
```

Open http://localhost:5173, then create an account.

- By default the API uses **PGlite** (embedded Postgres) stored in `backend/.pglite/`. Migrations run automatically at boot.
- Without SMTP configured, verification and password-reset **links are printed in the API console** (development only).

To use Neon (or any Postgres) locally, copy `backend/.env.example` to `backend/.env` and set `DATABASE_URL`.

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` | API + web with hot reload |
| `npm test` | All unit + integration tests (shared, backend, frontend) |
| `npm run typecheck` | Strict TypeScript across all workspaces (incl. service worker) |
| `npm run build` | Production builds (`backend/dist`, `frontend/dist`) |
| `npm run db:generate` | Generate a SQL migration after editing `backend/src/db/schema` |
| `npm run db:migrate` | Apply migrations to `DATABASE_URL` |
| `npm run icons -w frontend` | Regenerate PWA icons |

---

## Environment variables

### Backend (`backend/.env`), all server-side only

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | prod | `pglite:./.pglite` | Neon **pooled** URL, e.g. `postgresql://…-pooler…/db?sslmode=require`. `pglite:memory` for ephemeral |
| `JWT_ACCESS_SECRET` | prod | dev fallback | ≥ 32 chars. `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `APP_URL` | prod | `http://localhost:5173` | Used in email links |
| `CORS_ORIGINS` | prod | `http://localhost:5173` | Comma-separated allowlist |
| `COOKIE_SAMESITE` | | `lax` | `lax` with a same-origin `/api` rewrite (recommended); `none` for a cross-site API |
| `COOKIE_DOMAIN` | | — | Only if you share cookies across subdomains |
| `TRUST_PROXY` | | `0` | Number of proxies in front (correct client IPs for rate limiting) |
| `ACCESS_TOKEN_TTL_MIN` / `REFRESH_TOKEN_TTL_DAYS` / `SESSION_TTL_HOURS` | | 15 / 30 / 24 | Session lifetimes ("remember me" vs browser session) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | for email | — | Any SMTP provider (Resend, Postmark, SES…) |
| `DATABASE_POOL_MAX` | | 10 | pg pool size |
| `DISABLE_JOBS` | | `false` | Disable in-process scheduler (if using external cron) |
| `LOG_LEVEL` | | `info` | pino level |

The server **refuses to start in production** without `JWT_ACCESS_SECRET` or with a PGlite URL.

### Frontend (`frontend/.env`), public values only

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Leave **unset** to use same-origin `/api` (recommended). Never put secrets in `VITE_*`; they ship to the browser. |

---

## Deployment

**Recommended topology:** Vercel (frontend) rewrites `/api/*` to the API host. The browser only ever talks to one origin, so cookies are first-party (`SameSite=Lax`) and CORS isn't needed for the app itself.

1. **Database: Neon**
   - Create a project and copy the **pooled** connection string.
   - Run migrations: `DATABASE_URL=… npm run db:migrate` (the API also applies them at boot).
2. **API: Render** (or Railway, Fly.io, or any Node host / Docker)
   - Render: *New → Blueprint* and select this repo (uses [`render.yaml`](render.yaml)). Set `DATABASE_URL`, `APP_URL`, `CORS_ORIGINS` and SMTP vars.
   - Docker: `docker build -f backend/Dockerfile -t expenseflow-api .`
   - Health check: `GET /api/health`.
3. **Frontend: Vercel**
   - Import the repo with **Root Directory = `frontend`**.
   - Edit [`frontend/vercel.json`](frontend/vercel.json): replace `YOUR-API-HOST.onrender.com` with your API host.
   - The config ships a strict CSP, HSTS, long-lived immutable asset caching and a no-cache service worker.
   - *Cloudflare Pages:* build `npm run build -w frontend`, output `frontend/dist`. Add an `/api/*` proxy via a Pages Function and an SPA fallback.

**HTTPS is required** for service workers, secure cookies and installability. All of the hosts above provide it.

---

## Installing the app

- **Android / desktop Chrome & Edge:** the in-app **Install** button triggers the native prompt.
- **iOS / iPadOS Safari:** tap **Share → Add to Home Screen**. The app shows this guide automatically when no native prompt exists.
- **macOS Safari:** **File → Add to Dock**.

Once installed, the app shell is precached, so it opens offline.

---

## How offline sync works (summary)

- Every transaction gets a client-generated UUID, which doubles as the server's idempotency key.
- Writes go to IndexedDB first, plus an **outbox**. The UI updates instantly via Dexie live queries.
- The outbox flushes in FIFO order on start, `online`, tab focus, a 60 s interval, after each write, and via Background Sync where supported. It retries with exponential backoff.
- Updates carry a `version`. A stale version gets `409` plus the current row, and the client keeps the server copy and tells the user (server wins).
- Deletes are tombstones, so they propagate to other devices through `GET /api/sync/pull?cursor=`.
- Dashboard totals are computed locally (decimal-exact) so they work offline. Analytics and budgets render from a persisted query cache.

Full details are in [docs/ARCHITECTURE.md §6](docs/ARCHITECTURE.md#6-offline-synchronization-strategy).

---

## Security notes

- **Passwords:** Argon2id (OWASP params). Login does constant-time work for unknown emails, so accounts can't be enumerated.
- **Sessions:** 15-minute JWT access cookie (`HttpOnly`, path `/api`) plus an opaque refresh cookie (`HttpOnly`, path `/api/auth`, stored as SHA-256). Refresh tokens rotate, and reuse revokes the whole session family.
- **CSRF:** double-submit token (`ef_csrf` cookie + `X-CSRF-Token` header) on every state-changing request, plus `SameSite` and a CORS allowlist.
- **Authorization:** every repository query is scoped by the user id from the verified token. Foreign ids return `404`.
- **Input:** Zod on every body and query (shared with the client), parameterized Drizzle queries, and a 100 kB JSON limit.
- **Uploads:** size-limited, with the type verified by **magic bytes** (never the client MIME type). Files are served with `nosniff` and a sandboxed CSP.
- **Rate limits:** global, plus strict limits on auth and email endpoints. Helmet headers are on, and HSTS in production.
- **Logging:** structured pino logs with passwords, tokens and cookies redacted.
- **Exports:** CSV/XLSX cells are escaped against formula injection.

---

## Testing

```bash
npm test
```

- `shared`: money math (no float drift, rounding), date and recurrence math (month-end clamping, leap years, budget windows).
- `backend`: integration tests against an in-memory Postgres. They cover auth (CSRF, rotation, reset, verify), user isolation, idempotent creates, optimistic concurrency, tombstone sync, pagination, filters, exact analytics, single-fire budget alerts, idempotent recurring generation, category reassignment and export escaping.
- `frontend`: local analytics (decimal-exact totals, cumulative series, grouping).

---

## Project structure

```
backend/src   config · controllers · routes · middleware · services · repositories · jobs · db/{schema,migrations} · utils
frontend/src  components/{ui} · features/{auth,onboarding,dashboard,transactions,budgets,analytics,categories,recurring,notifications,profile,data}
              layouts · hooks · lib · services (sync engine, local-first ops) · stores · styles · sw.ts
shared/src    constants · schemas (Zod) · types (DTOs) · money · dates
```

Validators live in `shared/src/schemas.ts` so the client and server use exactly the same rules.

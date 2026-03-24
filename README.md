# Movie Memory

Small full-stack app: sign in with Google, save a favorite movie, then generate short “fun facts” via OpenAI. Facts are stored in Postgres. This repo implements the **base requirements** plus **Variant A** (backend caching, burst protection, and safe failure handling around fact generation).

**Repository:** https://github.com/chandramouli369/MovieSite  

**Live demo:** https://movie-site-jet.vercel.app  

For production, set `NEXTAUTH_URL` to `https://movie-site-jet.vercel.app` (no trailing slash) and add that origin plus `https://movie-site-jet.vercel.app/api/auth/callback/google` in the Google OAuth client.

## Stack

- **Runtime / framework:** Node.js, Next.js 16 (App Router), React 19, TypeScript  
- **UI:** Tailwind CSS  
- **Auth:** NextAuth.js with Google OAuth (JWT sessions)  
- **Database:** PostgreSQL via Prisma 7  
- **DB driver:** `@prisma/adapter-pg` + `pg` (required for Prisma 7 in this setup)  
- **LLM:** OpenAI (`gpt-4o-mini` by default)  
- **Tests:** Vitest (`npm run test`)

## Prerequisites

- **Node.js** 20+ recommended (matches dev tooling in this project)  
- A **PostgreSQL** database reachable from your machine (local install or hosted, e.g. Neon)  
- **Google Cloud** OAuth client (Web application)  
- **OpenAI** API key with quota / billing as required by your account  

## Setup

```bash
git clone https://github.com/chandramouli369/MovieSite.git
cd MovieSite
cp .env.example .env
```

Fill in `.env` (see below). Then:

```bash
npm install
npx prisma migrate dev
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

`postinstall` runs `prisma generate` so the generated client is created after `npm install` even though generated output is gitignored.

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | Postgres connection string (include `sslmode=require` for Neon and most cloud providers). |
| `NEXTAUTH_URL` | Yes | Public origin of the app, e.g. `http://localhost:3000` locally or your production URL. |
| `NEXTAUTH_SECRET` | Yes | Random secret for signing session cookies. Generate with e.g. `openssl rand -base64 32`. |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth 2.0 Web client ID. |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth client secret. |
| `OPENAI_API_KEY` | Yes | OpenAI API key (`sk-...`). |
| `OPENAI_MODEL` | No | Overrides default `gpt-4o-mini`. |

**Google OAuth:** In Google Cloud Console → APIs & Services → Credentials → your OAuth client, set:

- **Authorized JavaScript origins:** `http://localhost:3000` (and your production origin if deployed)  
- **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback/google` (and production equivalent)  

`NEXTAUTH_URL` must match how you open the app (including `localhost` vs `127.0.0.1`).

Never commit `.env`. This repo ignores `.env*` via `.gitignore`.

## Database migrations

**Local / development** (creates or updates the DB from migrations in `prisma/migrations/`):

```bash
npx prisma migrate dev
```

**Production / CI** (apply existing migrations only, non-interactive):

```bash
npx prisma migrate deploy
```

After schema changes, create a new migration with `migrate dev` and commit the new folder under `prisma/migrations/`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server |
| `npm run build` | Production build |
| `npm run start` | Run production server (after `build`) |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (Variant A unit tests for fact logic) |

## Architecture (overview)

### User flow

1. **`/`** — Landing with “Sign in with Google”. If already signed in, the app calls `GET /api/me` and sends the user to **`/onboarding`** if `favoriteMovie` is empty, else **`/dashboard`**.  
2. **`/onboarding`** — First-time users submit a favorite movie; **`PUT /api/me/movie`** validates (trim + length) and upserts `AppUser`.  
3. **`/dashboard`** — Shows Google profile fields (with fallbacks), favorite movie, logout, and “Get a fun fact” which calls **`GET /api/fact`**.  
4. Unauthenticated visits to **`/dashboard`** or **`/onboarding`** redirect to **`/`**.

### Auth

- NextAuth route: `src/app/api/auth/[...nextauth]/route.ts`  
- Config: `src/lib/auth.ts` — Google provider, JWT strategy, `jwt` + `session` callbacks so email / name / picture flow into the session.

### API routes

- **`GET /api/me`** — Session required; upserts `AppUser` from Google email and returns profile + `favoriteMovie`.  
- **`PUT /api/me/movie`** — Session required; body `{ favoriteMovie }` validated with Zod.  
- **`GET /api/fact`** — Session required; uses **Variant A** fact service (see below). Response JSON includes `fact`, `createdAt`, and `source` (`cached` | `generated` | `stale_fallback`). Concurrent generation may return **409** with a short retry message.

### Data model (Prisma)

- **`AppUser`** — `email` (unique), optional `name` / `image`, optional `favoriteMovie` (VARCHAR 200).  
- **`Fact`** — One row per generated fact: `userId`, `movieTitle` (snapshot at generation time), `factText`, `createdAt`. Indexed by user + recency and user + movie + recency.  
- **`FactGenerationLock`** — Composite primary key `(userId, movieTitle)` used as a short-lived mutex so overlapping requests don’t all call OpenAI at once.

### Variant A — fact generation (`src/lib/fact-service.ts`)

- **60-second cache:** If the latest `Fact` for that user + movie is newer than 60s, return it without calling OpenAI.  
- **Burst / idempotency:** Try to insert a row in `FactGenerationLock` for that user + movie. If another request holds the lock, wait briefly for a fresh fact; if still blocked, respond with 409. Stale locks (>45s) can be cleared and retried once.  
- **OpenAI failure:** If the API throws and an older fact exists for that user + movie, return that fact with `source: stale_fallback`. If there is no prior fact, return an error.

### Prisma client location

Generated client is written to `src/generated/prisma` (see `schema.prisma` generator block). That folder is gitignored; `npm install` / `prisma generate` recreates it.

## Variant choice: **A** (backend-focused)

**Why A:** The brief’s Variant A lines up with how I wanted to harden the fact feature: correct behavior under refresh and multiple tabs, predictable cost/latency within a time window, and a defined story when OpenAI is down. Variant B is strong for API contracts and optimistic UI, but I prioritized server-side correctness and caching semantics first.

## Tradeoffs

- **Lock table vs other guards:** A dedicated `FactGenerationLock` row is simple and works across server instances that share Postgres; it adds one table and a couple of round-trips. An in-memory lock would be wrong for serverless multi-instance deploys.  
- **JWT sessions:** No `Session` table in Prisma; user rows are keyed by Google email. Simpler, but account linking across providers is out of scope.  
- **Movie snapshot on `Fact`:** Each fact stores the `movieTitle` string at generation time so history stays meaningful if the user ever changes their favorite movie later.  
- **Gitignored Prisma output:** Cloners must run `npm install` (or `prisma generate`) before `npm run build`; `postinstall` handles the common case.

## If I had ~2 more hours

- Add **`GET /api/fact/latest`** (or extend `GET /api/fact` with a query flag) so the dashboard can show the last fact without implying a new generation.  
- Tighten **409** handling in the UI (auto-retry once with backoff).  
- Add a **small integration test** against a test DB or containerized Postgres for the lock + migration path.  
- **README video** walkthrough and a one-click **deploy** note (Vercel env vars + `migrate deploy`).

## How this was built

- Started from the standard Next.js app scaffold, then wired Postgres, auth, and the fact flow by hand.  
- When something was unclear, I checked the official Prisma, Next.js, NextAuth, and OpenAI docs.  
- What you read above matches what is in the tree; I kept `.env` out of git on purpose.

## License

Private / assessment use unless you add a license.

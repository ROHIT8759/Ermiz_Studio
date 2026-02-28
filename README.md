# Ermiz Studio

Forget about syntax language or framework, design systems that scales and last for decades  

![Preview](/public/preview.png)

---

## Product & Tech Stack

### Product overview

- Visual backend design platform to model APIs, processes, and infrastructure as explicit specs.
- Generates canonical OpenAPI / AsyncAPI plus plain JSON for the rest.
- The editor is a projection of the source files â€” no hidden logic.
- Optional AI compilation step that generates code without changing the specs.

### Tech stack

- Frontend: Next.js 16 (App Router), React 19, TypeScript.
- UI: Tailwind CSS v4, XYFlow (node editor), Lucide icons, `clsx` + `tailwind-merge`.
- State & validation: Zustand for client state, Zod for schema validation.
- Backend: Next.js route handlers for API endpoints.
- Data: PostgreSQL + Prisma ORM, JSONB documents for design artifacts.
- Auth: Supabase Auth with Google OAuth, enforced via middleware.

---

## Backend (Prisma + Postgres)

### Setup

- Copy `.env.example` to `.env` and set `DATABASE_URL` to your Postgres instance. Defaults assume schema `public`.
- Install dependencies and generate the Prisma client: `npm install && npm run prisma:generate`.
- Create/migrate the database: `npm run prisma:migrate -- --name init`.

### Data model (high level)

- Users with per-user credit balance and ledger (monthly free grant + dummy payments).
- Documents stored per tab (`tab` enum) with JSONB `content` and optional `metadata`; `DocumentSet` groups multiple documents for a tab.

### API routes (app router)

- `GET /api/credits` â€” returns refreshed credit balance (applies monthly free grant based on `FREE_RESET_DAY_OF_MONTH`).
- `POST /api/credits/use` â€” consume credits; rejects if over balance.
- `POST /api/payments/dummy` â€” adds credits via dummy payment.
- `GET/POST /api/documents` â€” list or create JSON documents per tab (charges 1 credit on create).
- `GET/PATCH/DELETE /api/documents/:id` â€” read/update/delete a document (update charges 1 credit).
- `GET/POST /api/document-sets` â€” manage document collections per tab.

Auth uses Supabase with Google OAuth. All protected routes are enforced by `middleware.ts`; if the Supabase session cookie is missing/expired, the user is redirected to `/login`.

### Authentication (Supabase)

- Configure Supabase project and enable Google OAuth. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in `.env`.
- Redirect URL in Supabase should include `http://localhost:3000/auth/callback` for local dev.
- Login page at `/login` triggers `signInWithOAuth` (Google). The OAuth code is exchanged at `/auth/callback`, setting httpOnly Supabase auth cookies.
- Middleware refreshes access tokens using the Supabase refresh token; if refresh fails, the user is sent back to `/login`.

---

## What This Is

This project is a **visual backend design platform** inspired by node-based systems (like n8n), but built for **real backend engineering**, not low-code demos.

You design:

- **External APIs** (REST, Events, WebSockets)
- **Internal processes** (functions, workflows, jobs)
- **Infrastructure** (databases, queues)

All of this is expressed as:

- **Industry-standard specifications** (OpenAPI / AsyncAPI)
- **Plain, structured JSON** for everything else

There is no hidden logic.
There is no magic.
What you see is what gets built.

---

## What It Does

### 1. Designs APIs Correctly

- REST APIs â†’ OpenAPI
- Event / WebSocket APIs â†’ AsyncAPI

Each API:

- Is created by choosing its **type first**
- Generates **one canonical spec file**
- Contains **no business logic**

APIs describe **how your system is called**, not how it works.

---

### 2. Designs Internal Processes Explicitly

Processes are first-class citizens.

You can design:

- Calculations
- Database workflows
- Background jobs
- Queue consumers
- Scheduled tasks

Each process explicitly declares:

- Name
- Type
- Execution model (sync / async / scheduled / event-driven)
- Inputs (typed)
- Outputs (typed, including errors)
- Step-by-step execution graph

Processes are expressed in **plain JSON**, not code.

---

### 3. Models Infrastructure as Capabilities

Databases, queues, and similar systems are **not helpers** â€” they are **capability boundaries**.

Infrastructure blocks declare:

- What they are (SQL, NoSQL, queue, etc.)
- What they support (transactions, retries, joins, etc.)
- Where and how they can be used

Nothing is assumed.
Nothing is implicit.

---

### 4. Keeps a Single Source of Truth (Per Concern)

There is no â€œvisual-onlyâ€ state.

| Concern            | Source of Truth |
| ------------------ | --------------- |
| REST APIs          | OpenAPI         |
| Event / WS APIs    | AsyncAPI        |
| Processes          | Plain JSON      |
| Databases / Queues | Plain JSON      |
| Schemas            | Shared registry |

The visual editor is a **projection**, not the truth.

---

### 5. Uses AI Safely (Optional)

AI is an **extension**, not the foundation.

AI can:

- Generate process graphs from descriptions
- Suggest missing fields or validations
- Generate backend code from specs + JSON

AI cannot:

- Invent architecture
- Modify definitions silently
- Bypass declared inputs/outputs
- Replace specs with â€œbest guessesâ€

You stay in control.

---

## How It Works (High Level)

### Step 1: Choose What Youâ€™re Designing

- API (REST / Event)
- Process
- Infrastructure

This choice **locks the rules**.

---

### Step 2: Use a Spec-Aware Canvas

- Nodes available depend on what youâ€™re designing
- Invalid connections are impossible
- Everything you place maps deterministically to source files

The editor enforces correctness **by construction**.

---

### Step 3: Generate Canonical Outputs

- APIs â†’ OpenAPI / AsyncAPI
- Processes â†’ JSON
- Infrastructure â†’ JSON

All outputs are:

- Deterministic
- Versionable
- Machine-readable
- Human-auditable

---

### Step 4: (Optional) Compile With AI

AI consumes the generated files and produces:

- Backend code
- Infrastructure bindings
- Client SDKs

The specs and JSON remain the authority.

---

## Design Principles

- **Structure over decoration**
- **Editing is cheaper than rebuilding**
- **No implicit behavior**
- **No proprietary formats**
- **No universal-spec fantasies**

> Universality lives in the editor, not the document.

---

## What This Is NOT

- âŒ A low-code platform
- âŒ A diagramming tool
- âŒ A visual scripting language
- âŒ An OpenAPI replacement
- âŒ An AI-first system

If it hides structure, itâ€™s out of scope.

---

## Mental Model

> **Figma for backend systems**
>
> - APIs = contracts
> - Processes = execution
> - Infrastructure = capabilities
> - AI = compiler

---

## Who This Is For

- Backend engineers who want **clarity before code**
- Teams that care about **long-term maintainability**
- Developers who like AI but **donâ€™t trust it blindly**
- Anyone tired of undocumented backend behavior

---

## Why This Exists

Most backend tools fail in one of two ways:

1. Too abstract â†’ not real
2. Too manual â†’ too slow

This tool sits in between:

- Explicit enough to be correct
- Visual enough to be fast
- Structured enough for AI
- Honest enough for engineers

---

## Status

Early-stage, design-driven.
APIs and schemas are expected to evolve.

Breaking changes are acceptable **until v1**.

---

## Future Scope (Not Promises)

- GraphQL support
- RPC / Protobuf
- Multi-service projects
- Policy and auth modeling
- Infra export (Terraform, etc.)

Only when they fit the model.

---

## Final Note

If this ever becomes:

- Harder to change than to rebuild
- Less explicit than code
- More magical than honest

Then it has failed.

---

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm (or npm)
- A [Supabase](https://supabase.com) project with Google OAuth enabled
- A PostgreSQL database (Supabase provides one — no separate DB needed)

### 1. Clone & install

```bash
git clone https://github.com/ROHIT8759/Ermiz_Studio.git
cd Ermiz_Studio
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL, and DIRECT_URL
```

Set `http://localhost:3000/auth/callback` as an allowed redirect URL in your
Supabase project's **Authentication  URL Configuration**.

### 3. Migrate the database

```bash
pnpm run prisma:migrate -- --name init
```

### 4. Run locally

```bash
pnpm run dev
# Open http://localhost:3000
```

---

## Deployment

### Vercel (recommended)

1. Push to GitHub and import the repository in [Vercel](https://vercel.com).
2. Add all variables from `.env.example` in the Vercel project settings.
3. Add your Vercel production URL to Supabase's allowed redirect URLs.
4. Deploy — `pnpm run build` runs automatically.

### Database migrations on deploy

Run `pnpm run prisma:migrate -- --name <change>` locally before pushing, or
integrate `prisma migrate deploy` into your CI pipeline.
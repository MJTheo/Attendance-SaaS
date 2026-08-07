# Attendance SaaS

**Status: v0.1.0-alpha** — all four planned build phases (foundation, corrections, analytics, polish) are deployed and live at the demo link below. Pre-1.0: expect schema and API shape to still move.

A multi-tenant workforce attendance system: organizations sign up, staff clock in/out, corrections go through an auditable approval workflow, and admins get team-wide attendance analytics.

This is a rebuild of a Google Apps Script attendance tool that ran in production for 30+ daily users — same business logic, given a real backend, database, and multi-tenant architecture.

**Live demo:** https://attendance-saa-s.vercel.app — click **"View live demo"** on the sign-in page to explore as an admin of a seeded demo org (no signup needed). It's a shared, publicly-writable sandbox: feel free to click around, but expect other visitors' changes to show up too. Staff-invite is disabled on the demo account since it would otherwise send real email to whatever address a visitor typed in.

## Stack

- **Backend:** Python, FastAPI
- **Database + auth:** PostgreSQL via Supabase (Postgres row-level security for tenant isolation)
- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS
- **Background jobs:** APScheduler
- **Deploy:** backend on Railway, frontend on Vercel

## Architecture

The non-negotiable rules this project was built around:

1. **Tenant isolation is enforced at the database layer**, not just in application code. Every tenant-scoped table (`users`, `attendance_records`, `corrections`, `reports`) has Postgres row-level security keyed off `org_id`, using `SECURITY DEFINER` helper functions (`app.current_org_id()`, `app.is_admin()`) in a schema PostgREST doesn't expose. A missing `WHERE org_id = ...` in application code can't leak another org's data — RLS still blocks it.
2. **No silent edits to attendance records.** Any change to `attendance_records` that isn't a direct clock-in/out goes through the `corrections` table, with the old value snapshotted server-side (never trusted from the client) and a full audit trail of who requested, who approved, and why. A Postgres trigger enforces this at the database level — staff can't update a closed clock-in record even if they bypass the API.
3. **Business logic lives in the API layer**, not the frontend and not the database (beyond integrity constraints). Status calculation, streak calculation, and pattern analytics are all computed server-side in Python; the frontend only renders what the API returns.
4. **Data access goes through a repository/service layer.** Routers depend on services, services depend on repositories, repositories are the only code that touches the Supabase client directly — the database could be swapped without rewriting business logic.
5. **Two Supabase client patterns, chosen deliberately per call site:** a per-request client that forwards the caller's own JWT (so RLS evaluates as that user, not as an app-wide superuser) is the default for everything. A service-role client that bypasses RLS entirely is reserved for the handful of operations that structurally require it — org bootstrap, applying an approved correction, the scheduled report job, and creating a new Supabase Auth identity when inviting staff — and each one is commented explaining why.
6. **Auth tokens are verified against Supabase's JWKS endpoint** (ES256, asymmetric), not a shared static secret — no `SUPABASE_JWT_SECRET` to leak.

### Data model

- `organizations` — id, name, plan, created_at
- `users` — id (= `auth.users.id`), org_id, role (`admin` / `staff`), name, email
- `attendance_records` — id, org_id, user_id, clock_in, clock_out, status, notes
- `corrections` — id, attendance_record_id, org_id, requested_by, approved_by, reason, old_value, new_value, status, created_at, resolved_at
- `reports` — id, org_id, type, generated_at, payload (jsonb)

### Notable trade-offs

- **No shift-schedule config exists yet**, so there's nothing to compare a clock-in time against. Every clock-in defaults to `present`; `late`/`early_leave`/`absent` only ever appear via an admin-approved correction. Streak and pattern analytics are computed only from records that actually exist — a day with no record isn't assumed to be a missed workday, since there's no concept of which days someone was scheduled to work.
- **Supabase's free-tier mailer has a low email rate limit** (a couple of sends/hour). The invite endpoint distinguishes that from "email already registered" and returns a proper 429, but real production use would want a custom SMTP provider configured in Supabase to lift it.
- **The demo account is a shared, mutable login**, not a read-only sandbox — simplest way to let a visitor explore the real app (real RLS, real API, real writes) without a signup step.
- **Creating a new org requires a TOTP access code** (`/auth/signup`'s "Access code" field), same rotating-code mechanism as an authenticator app — keeps a public deployment from letting random visitors spin up real orgs, without a static secret sitting in the signup form.

## Local development

```bash
# Backend
cd backend
python -m venv .venv
.venv/Scripts/activate  # or source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp backend.env.example .env  # fill in your Supabase project's values
uvicorn app.main:app --reload

# Frontend
cd frontend
npm install
cp .env.example .env  # fill in your Supabase project's values
npm run dev

# Database
supabase link --project-ref <your-project-ref>
supabase db push  # applies supabase/migrations/*.sql
```

## Build phases

1. **Foundation** — org sign-up, auth, core clock in/out
2. **Corrections + admin dashboard** — correction workflow with audit trail, team-wide attendance view, staff invites
3. **Analytics** — streak/pattern tracking, scheduled weekly reports
4. **Polish** — visual identity, seeded public demo, this README

All four are deployed and live at the demo link above.

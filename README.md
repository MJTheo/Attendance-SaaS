# Landas Time

**Status: v0.1.2-alpha (Build Phase 2, in progress)** — foundation, corrections, leave requests, calendar, analytics, and attendance-integrity automation (once-per-day clock cap, missed-clockout auto-flagging) are deployed and live at the demo link below, along with Build Phase 2 so far: super admin role, configurable working days and timezone, the Company page, and approval-gated profile edits. Next up is notifications — see [ROADMAP.md](ROADMAP.md).

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

1. **Tenant isolation is enforced at the database layer**, not just in application code. Every tenant-scoped table (`users`, `attendance_records`, `corrections`, `leave_requests`, `reports`) has Postgres row-level security keyed off `org_id`, using `SECURITY DEFINER` helper functions (`app.current_org_id()`, `app.is_admin()`) in a schema PostgREST doesn't expose. A missing `WHERE org_id = ...` in application code can't leak another org's data — RLS still blocks it.
2. **No silent edits to attendance records.** Any change to `attendance_records` that isn't a direct clock-in/out goes through the `corrections` table, with the old value snapshotted server-side (never trusted from the client) and a full audit trail of who requested, who approved, and why. A Postgres trigger enforces this at the database level — staff can't update a closed clock-in record even if they bypass the API. Sick/annual leave follows the same audit-trail shape via a separate `leave_requests` table, since a leave day isn't a clock-in event to correct — it's the deliberate absence of one.
3. **Business logic lives in the API layer**, not the frontend and not the database (beyond integrity constraints). Status calculation, streak calculation, and pattern analytics are all computed server-side in Python; the frontend only renders what the API returns.
4. **Data access goes through a repository/service layer.** Routers depend on services, services depend on repositories, repositories are the only code that touches the Supabase client directly — the database could be swapped without rewriting business logic.
5. **Two Supabase client patterns, chosen deliberately per call site:** a per-request client that forwards the caller's own JWT (so RLS evaluates as that user, not as an app-wide superuser) is the default for everything. A service-role client that bypasses RLS entirely is reserved for the handful of operations that structurally require it — org bootstrap, applying an approved correction, the scheduled report job, and creating a new Supabase Auth identity when inviting staff — and each one is commented explaining why.
6. **Auth tokens are verified against Supabase's JWKS endpoint** (ES256, asymmetric), not a shared static secret — no `SUPABASE_JWT_SECRET` to leak.

### Data model

- `organizations` — id, name, plan, created_at, working_days (bitmask of the weekdays this org operates, Monday=0..Sunday=6 — any subset, e.g. Tue-Sat, not just "the first N days"), timezone (IANA name, e.g. `Asia/Manila`)
- `users` — id (= `auth.users.id`), org_id, role (`admin` / `staff` / `super_admin`), name, email
- `attendance_records` — id, org_id, user_id, clock_in, clock_out, status, notes
- `corrections` — id, attendance_record_id, org_id, requested_by, approved_by, reason, old_value, new_value, status, created_at, resolved_at
- `leave_requests` — id, org_id, user_id, leave_type (`sick` / `annual`), start_date, end_date, reason, status, requested_by, approved_by, created_at, resolved_at
- `reports` — id, org_id, type, generated_at, payload (jsonb)

### Notable trade-offs

- **No shift-schedule config exists yet**, so there's nothing to compare a clock-in time against. Every clock-in defaults to `present`; `late`/`early_leave`/`absent` only ever appear via an admin-approved correction. Streak and pattern analytics are computed only from records that actually exist — a day with no record isn't assumed to be a missed workday, using each org's `working_days` (not a hardcoded Mon–Fri assumption) to tell a non-working day apart from an actual gap.
- **Supabase's free-tier mailer has a low email rate limit** (a couple of sends/hour). The invite endpoint distinguishes that from "email already registered" and returns a proper 429, but real production use would want a custom SMTP provider configured in Supabase to lift it.
- **The demo account is a shared, mutable login**, not a read-only sandbox — simplest way to let a visitor explore the real app (real RLS, real API, real writes) without a signup step.
- **Creating a new org requires a TOTP access code** (`/auth/signup`'s "Access code" field), same rotating-code mechanism as an authenticator app — keeps a public deployment from letting random visitors spin up real orgs, without a static secret sitting in the signup form.
- **Five status colours, plus an icon per status.** Statuses fall into five meaning groups (good, warning, neutral, sick leave, annual leave), each with one colour. Late, early leave and missed clock-out share the warning colour, so each status also carries its own icon and label (`components/StatusDot.tsx`) — colour alone never has to carry the meaning, which also keeps it colour-blind safe. The brand's vermilion is reserved for signals (unread counts, errors) and never used for a status.
- **Times are shown in the org's timezone, and a few display details are computed in the browser.** Every timestamp renders in `organizations.timezone` (returned by `/auth/me`), not the viewer's device zone. The dashboard's 06:00–22:00 track position, the running shift duration and the week-grouping of history are presentation of server timestamps, so they're computed client-side (`lib/datetime.ts`); status, streaks and analytics stay server-side. A `missed_clockout` record's `clock_out` is the closeout job's day-boundary placeholder, so the UI shows it as "—" and the correction form starts that field empty. The Team page's attendance grid works the same way: it buckets records into days in the org's timezone and fills days that have no record with approved leave, while the Analytics trend's `present_rate` (share of the people with a status that day who clocked in) comes from the API.
- **The Inbox count is derived, not stored.** `GET /notifications` counts pending approvals the caller may act on (excluding their own profile change while another admin exists) and their own missed clock-outs without a correction, on every read. `GET /notifications/inbox` returns the items behind those counts from the same function, which the Inbox page lists — so the badge and the page always agree. No read/unread state yet — a real notifications log waits until push or history is needed.
- **Analytics trend/distribution cover a trailing 30-day window**, not all-time, so the payload stays bounded regardless of how long an org has been running.
- **`super_admin` is a distinct role value, not a flag on top of `admin`**, and `app.is_admin()` treats it as a superset — a super admin passes every existing admin check without duplicating policies. Role changes are gated by a dedicated `app.is_super_admin()` check and a DB trigger (`users_role_change_guard`), not RLS alone, because RLS is row-level and can't stop an admin from rewriting just the `role` column on an otherwise-permitted update. An org can have any number of super admins, and the trigger blocks a super admin from removing their own super_admin role — the one thing worth hard-blocking, since it's the only way an org could lock itself out of ever promoting anyone again.
- **`organizations.working_days` is stored as a 7-bit mask, not an int count.** The original "5/6/7 = the first N weekdays" design couldn't express a Tue–Sat schedule. The mask only exists at the storage boundary (`repositories/organizations.py`'s `mask_to_days`/`days_to_mask`) — every consumer (streak calculation, the late-rate-by-weekday chart, the daily closeout job's non-working-day check, the settings UI) works with a plain list of weekday indices.
- **A day with no attendance record reads as "no data", not "confirmed absent."** The closeout job used to auto-create a real `absent` row for every no-show; it now only flags abandoned open shifts as `missed_clockout`. Existing auto-absent rows from before this change are left alone as historical fact rather than backfill-deleted, since mass-deleting real `attendance_records` outside the corrections flow would itself violate the no-silent-edits rule. `compute_streak` anchors its backward walk on "today" (or yesterday, if today has no record yet) rather than the latest date with any record, specifically because it can no longer rely on a fresh auto-absent row to keep recent days "seen."
- **Every "what day is it" calculation is scoped to the org's own timezone (`organizations.timezone`), not UTC or the server's clock.** The once-per-day clock-in cap, streaks, the daily closeout job's target day, and every calendar/analytics day-bucketing function all convert through it (`analytics_service.py`'s `_to_local_date`/`local_day_bounds`). This matters most for the closeout job: without it, an org meaningfully outside UTC could get flagged `missed_clockout` mid-shift or marked `absent` before its day had actually started locally. The closeout job computes each org's target day independently as "now in that org's timezone, minus one day," so correctness doesn't depend on when in UTC the cron happens to fire.
- **Profile edits are approval-gated, but the login email can't be hard-gated.** Name and email changes go through `profile_edit_requests` (a second person approves, unless you're the org's only admin-level member), and `users_profile_fields_guard` stops anyone editing `users.name`/`email` directly. The login email itself lives in Supabase Auth, which lets any signed-in user change it with `auth.updateUser()` — so approval only unlocks the app's "send confirmation link" step, and a trigger on `auth.users` keeps `public.users.email` in step with the real login so an out-of-band change is at least visible rather than silently stale.
- **Org columns have different edit rights, enforced by a trigger, not just RLS.** Any admin can change `working_days`/`timezone`; only a super admin can rename the org; nobody but the backend's service role can change `plan`. The `organizations_column_guard` trigger enforces this at the DB layer for the same reason `users_role_change_guard` exists — the RLS update policy is row-level, so on its own it would let any admin rewrite any column directly through PostgREST, `plan` included.

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

# Backend tests (no Supabase or .env needed — repositories are faked)
cd backend
pip install -r requirements-dev.txt
python -m pytest
```

Live end-to-end checks against the deployed app (real accounts in a dedicated
test org; writes to production) live in [`e2e/`](e2e/README.md).

## Build phases

1. **Foundation** — org sign-up, auth, core clock in/out
2. **Corrections + admin dashboard** — correction workflow with audit trail, team-wide attendance view, staff invites
3. **Analytics** — streak/pattern tracking, scheduled weekly reports
4. **Polish** — visual identity, seeded public demo, this README

All four are deployed and live at the demo link above.

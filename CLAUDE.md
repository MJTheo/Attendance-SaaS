# Landas Time — project context

Multi-tenant workforce attendance SaaS. Organizations sign up, onboard their team, and manage clock-ins, correction requests, and attendance analytics.

This is a rebuild of a Google Apps Script attendance system that ran in production with 30+ daily users. The business logic is proven; this project gives it a real backend, database, and multi-tenant architecture.

## Stack

- **Backend:** Python, FastAPI
- **Database + auth:** PostgreSQL via Supabase (row-level security for tenant isolation)
- **Frontend:** React 18 + Vite + TypeScript, Tailwind CSS
- **Background jobs:** APScheduler
- **Deploy:** backend on Railway/Render, frontend on Vercel

## Architecture rules

These are non-negotiable — flag it rather than working around them:

1. **Tenant isolation is enforced at the database layer.** Every tenant-scoped table has `org_id` with Postgres row-level security. App-level filtering alone is not sufficient — a missing `WHERE` clause must never leak another org's data.
2. **No silent edits to attendance records.** Any change to `attendance_records` that isn't a direct clock-in/out goes through the `corrections` table with a full audit trail: who requested, who approved, old value, new value, reason, timestamp.
3. **Business logic lives in the API layer.** Status calculation (late/early_leave/absent), streak calculation, and pattern analytics are all server-side. The frontend renders; it does not compute.
4. **Data access goes through a dedicated layer.** Keep Postgres access behind a repository/service layer so the database could be swapped without rewriting business logic.
5. **Secrets live in `.env` files, gitignored. Never hardcode credentials or commit real values.**

## Data model

- `organizations` — id, name, plan, created_at, working_days (5/6/7, Monday-first)
- `users` — id, org_id (FK), role (admin/staff), name, email
- `attendance_records` — id, org_id, user_id, clock_in, clock_out, status, notes
- `corrections` — id, attendance_record_id, requested_by, approved_by, reason, old_value, new_value, status, created_at
- `leave_requests` — id, org_id, user_id, leave_type (sick/annual), start_date, end_date, reason, status, requested_by, approved_by, created_at, resolved_at
- `reports` — id, org_id, type, generated_at, payload

Attendance status values: `present`, `late`, `early_leave`, `absent`, `missed_clockout` (auto-flagged by the daily closeout job when a record is still open once its day has ended). Leave is a separate concept (its own table, its own approval workflow) rather than more `attendance_records.status` values — a leave day isn't a clock-in event to correct, it's the deliberate absence of one. Calendar/analytics views surface it alongside attendance status as `sick_leave`/`annual_leave`.

## Roles

- **staff** — clock in/out, view own history and streak, submit correction requests
- **admin** — everything staff can do, plus team dashboard, approve/reject corrections, view pattern analytics, configure org settings

## Build phases

Work through these in order. Do not start a phase before the previous one is deployed and testable.

1. **Foundation** — org sign-up, auth, core clock in/out. Deploy early even if the UI is bare.
2. **Corrections + admin dashboard** — correction workflow with audit trail, team-wide attendance view.
3. **Analytics** — streak/pattern tracking, scheduled reports via the job worker.
4. **Polish** — visual language, seeded public demo org, README with live demo link.

## Design language

Dark "systems dashboard" aesthetic, consistent with the owner's existing portfolio:

- Status communicated via colored dots — teal (good/present), amber (warning/late), slate (neutral/inactive), sky (sick leave), violet (annual leave). The palette grew from 3 to 5 colors when leave types were added; a calendar with 6 status types needs that to stay readable, but keep new colors this deliberate and documented rather than adding one per feature.
- JetBrains Mono for data, timestamps, and numeric fields
- Space Grotesk for headings
- Dense, information-first layouts — this is an ops tool, not a marketing site

## Working preferences

- When editing existing files, explain what changes and where rather than silently rewriting large sections.
- When a change spans several files, outline the plan before making edits.
- Prefer full, clean file contents over fragmented patches when a file is being substantially reworked.
- Note architectural trade-offs as they come up rather than deferring them.

## Definition of done for each phase

- Code committed with clear messages
- Phase deployed and manually testable
- Any architectural decisions or trade-offs noted

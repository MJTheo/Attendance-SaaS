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

- `organizations` — id, name, plan, created_at, working_days (bitmask of the weekdays this org operates, Monday=0..Sunday=6 — an arbitrary subset, not just "the first N days"), timezone (IANA name, e.g. `Asia/Manila` — defines "today" for the closeout job, the once-per-day clock cap, streaks, and the calendar; not the viewer's own device timezone)
- `users` — id, org_id (FK), role (admin/staff/super_admin), name, email
- `attendance_records` — id, org_id, user_id, clock_in, clock_out, status, notes. Staff have read-only DB access (RLS-scoped); clock-in/out go through the API, which computes the status and writes with the service-role client
- `corrections` — id, attendance_record_id, requested_by, approved_by, reason, old_value, new_value, status, created_at
- `leave_requests` — id, org_id, user_id, leave_type (sick/annual), start_date, end_date, reason, status, requested_by, approved_by, created_at, resolved_at
- `reports` — id, org_id, type, generated_at, payload
- `shift_templates` — id, org_id, name, start_time, end_time (same-day: end after start), created_at. Reusable named shifts
- `shift_assignments` — user_id (PK), org_id, template_id **or** custom_start/custom_end, updated_by, updated_at. Admins/super admins choose per person: a template, custom times, or no row (no shift → never late, early or auto-absent). Current state only; a status is computed at clock-in/out, so changing a shift never rewrites past records
- `profile_edit_requests` — id, org_id, user_id, requested_by, approved_by, reason, old_value, new_value (name and/or email), status, created_at, resolved_at. Same approval workflow as corrections; nobody approves their own request unless they're the org's only admin-level member. An approved email only takes effect once the user confirms it from the new inbox (the login email lives in Supabase Auth).

Attendance status values: `present`, `late` (clock-in after the shift's start minute), `early_leave` (clock-out before the shift's end), `late_early_leave` (both on the same day), `absent` (recorded by the daily closeout job only for people with a shift, on working days, with no record and no approved leave), `missed_clockout` (auto-flagged by the closeout job when a record is still open once its day has ended). Late/early only apply to people with a shift, on the org's working days. Leave is a separate concept (its own table, its own approval workflow) rather than more `attendance_records.status` values — a leave day isn't a clock-in event to correct, it's the deliberate absence of one. Calendar/analytics views surface it alongside attendance status as `sick_leave`/`annual_leave`.

## Roles

- **staff** — clock in/out, view own history and streak, submit correction, leave and profile-change requests
- **admin** — everything staff can do, plus team dashboard, approve/reject corrections, leave and other people's profile changes, view pattern analytics, configure org settings
- **super_admin** — everything admin can do, plus promote/demote other users' roles and rename the organization. A super admin can't remove their own super_admin role (DB-enforced, so an org can never lock itself out); the org's creator becomes its first super admin at signup, since only a super admin can ever create another one.

## Build phases

Work through these in order. Do not start a phase before the previous one is deployed and testable.

1. **Foundation** — org sign-up, auth, core clock in/out. Deploy early even if the UI is bare.
2. **Corrections + admin dashboard** — correction workflow with audit trail, team-wide attendance view.
3. **Analytics** — streak/pattern tracking, scheduled reports via the job worker.
4. **Polish** — visual language, seeded public demo org, README with live demo link.

## Design language

Direction B, "warm graphite ledger" — chosen from the Claude Design round of 2026-11-02 (canvas: https://claude.ai/code/artifact/0eff596e-9201-481b-bbcb-f412c4fbd55a, page "B — full design"; it is the visual spec for every screen). Tokens live in `frontend/src/index.css`.

- Warm paper/graphite neutrals. **Light is the default theme**; dark is opt-in and remembered per browser. Primary actions are filled graphite on light, paper on dark.
- **Status colour is the only colour in the data**: five meaning groups — good (present, approved), warning (late, early leave, missed clock-out, pending), neutral (absent, rejected), sick leave, annual leave. Every status is a tinted pill with **its own icon and its label** (`components/StatusDot.tsx`), never colour alone — that's what keeps the three warning states apart and colour-blind safe. Keep new colours this deliberate and documented rather than adding one per feature.
- **Vermilion is a signal, never a status**: the brand mark, unread counts (Inbox) and errors only.
- Instrument Sans for UI and headings; IBM Plex Mono for data, timestamps and numeric fields.
- Borderless cards (16px radius), 10px controls, 44px touch targets on mobile. Dense, information-first layouts — this is an ops tool, not a marketing site.
- Left sidebar nav (not a top bar), grouped "You" / "Manage", with an Inbox button whose count comes from `GET /notifications` and which opens the Inbox page (`/inbox`, one queue for everything waiting on you, from `GET /notifications/inbox`). The shell stays mounted across pages; pages show in-place skeletons while loading. On mobile the sidebar becomes a slide-in drawer behind a hamburger in a 58px top bar. Nav items that combine "my requests" with "approvals" (Leave, Corrections) open a small menu for admins/super admins (there are two places to go, with the queue's count); staff only ever have one place to go, so they get a plain link instead of a pointless one-item menu.

## Working preferences

- When editing existing files, explain what changes and where rather than silently rewriting large sections.
- When a change spans several files, outline the plan before making edits.
- Prefer full, clean file contents over fragmented patches when a file is being substantially reworked.
- Note architectural trade-offs as they come up rather than deferring them.

## Definition of done for each phase

- Code committed with clear messages
- Phase deployed and manually testable
- Any architectural decisions or trade-offs noted

## Coding guidelines (Karpathy)

Source: https://github.com/forrestchang/andrej-karpathy-skills/blob/main/CLAUDE.md

Where these general guidelines conflict with the project-specific rules above (architecture rules, working preferences), the project rules win.

Behavioral guidelines to reduce common LLM coding mistakes.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

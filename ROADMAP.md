# Roadmap

## Where things stand

**v1.0.0-alpha — Build Phase 1**, shipped 2026-08-08. Live at https://attendance-saa-s.vercel.app.

Everything from the original 4-phase plan (foundation, corrections + admin dashboard, analytics,
polish) plus a full extra round of work done after that: sick/annual leave requests with their own
audit-trailed approval workflow, a personal + team calendar (with per-day, per-person click-through
detail), analytics trend/distribution/weekday charts, dedicated Approvals (admin) and Requests
(everyone) pages split off Team/Dashboard, active-nav highlighting, a bigger clock-in/out hero, a
once-per-day clock-in cap, and a daily job that auto-flags `missed_clockout` and auto-creates
`absent` records.

This file is Build Phase 2 — everything queued up for next time, in the order I'd tackle it and why.
It's meant to be read cold, so each item has enough context to pick back up without re-deriving it.

## How to use this doc

Work top to bottom within a tier. **Tier 0 items are foundational** — several later items assume
they already exist, so doing them out of order usually means redoing work. Everything else is
roughly difficulty-ordered within its tier, but dependencies (noted per item) matter more than the
ordering.

---

## Tier 0 — Foundational (unlocks other items below)

### Super admin role
*User's #2.* Add a `super_admin` role alongside `admin`/`staff` (or a boolean flag on top of
`admin` — decide which when we start; a flag is less migration churn but a distinct role is cleaner
for RLS policies). Needs: enum/schema change on `users.role`, new RLS policies wherever `app.is_admin()`
is currently the gate but the action should be super-admin-only, and a `require_super_admin`
dependency mirroring `require_admin` in `dependencies.py`. Blocks #1, #4, #7, #17, and the
"can edit company logo/color scheme" part of #1.
**Open question:** exactly one super admin per org, or several? Can a super admin demote themselves?

### Configurable working days (arbitrary days, not just "first N")
*User's #18.* Today `organizations.working_days` is an int (5/6/7) interpreted as "the first N
weekdays, Monday-first" — see `backend/app/services/analytics_service.py`. A company running
Tue–Sat can't express that. Needs: replace the int with a day-of-week set (e.g. a `smallint` bitmask
or a `weekday_start`/`weekday_count`-with-offset pair — bitmask is more flexible, worth it here).
Every consumer of `working_days` needs updating: `compute_streak`, `late_rate_by_weekday`,
`app/jobs/closeout.py`'s non-working-day skip, and the frontend `WORKING_DAYS_LABEL` /
`Team.tsx` settings UI. Do this **before** #4 (holidays) and #7 (shift times) — both need a correct
notion of "is this a working day" to build on.

### Timezone handling
*Not in your list — I noticed this while building the closeout job and want to flag it before more
day-boundary logic gets built on top.* Every "what day is it" calculation (closeout job, streak,
working-day checks, the calendar) currently assumes UTC midnight == the org's local midnight. That's
wrong for any org outside UTC — the closeout job could flag someone `missed_clockout` mid-shift, or
mark someone `absent` before their day has actually started locally. Doesn't block Phase 1 (single
timezone, low volume), but #4 (holidays), #5 (overtime), #7 (shift times), and #8 (grace period) all
get meaningfully harder to reason about correctly without deciding this first. Needs: an
`organizations.timezone` column (IANA name, e.g. `Asia/Manila`) and rewriting day-boundary math to
use it instead of naive UTC dates.

---

## Tier 1 — Quick wins (no new data model, low risk, can do anytime)

### Collapse top bar for mobile
*User's #6.* `Header.tsx`'s nav already wraps on narrow screens but doesn't collapse — with Requests/
Approvals/Team/Analytics added this session it's getting crowded. Standard hamburger-menu treatment.

### Status labels shouldn't show underscores
*User's #14.* `early_leave` → "Early leave", `missed_clockout` → "Missed clock-out", etc. Right now
several places (`STATUS_OPTIONS` in `CorrectionRequestForm.tsx`, raw `record.status` in table cells)
render the raw enum value. Write one `formatStatusLabel()` helper and use it everywhere instead of
the ad-hoc `STATUS_LABEL` map that only exists in `Calendar.tsx` today.

### Spelling / capitalization pass
*User's #15.* General copy consistency pass across the UI — labels, button text, error messages.

### Hide clock in/out entirely once done for the day
*User's #16.* Since clock-in is now capped at once/day, showing a "Clock in" button that just 409s
is bad UX. When `history` already has a closed record for today, replace the hero card's button with
a "You're done for today" state instead of letting them tap it and get an error.

### Add requester detail to approval cards
*User's #3.* `CorrectionsList.tsx` and `LeaveRequestsList.tsx` show the reason and old/new values but
never the requester's name — an admin on the Approvals page can't tell who they're approving without
cross-referencing. `corrections`/`leave_requests` rows have `requested_by` (a user id); join it to a
name the same way `AttendanceRepository._flatten_user_name` does for attendance.

### Split corrections/leave into two pages on desktop
*User's #13.* This session I deliberately combined them into one Requests page and one Approvals page
to avoid nav bloat — you now want them separate for desktop. Straightforward: the components
(`LeaveRequestsList`, `CorrectionsList`, `LeaveRequestForm`) already exist standalone, this is
routing/page reorganization, not new logic. Consider: separate routes but keep a combined page on
mobile (where nav real estate is tighter), or just always separate and lean on #6's collapsed nav.

### Don't auto-create `absent` rows — describe the gap instead
*User's #12.* Reverses part of what shipped this session. Right now the daily closeout job
(`app/jobs/closeout.py`) inserts a real `attendance_records` row with `status='absent'` for anyone
with no clock-in and no approved leave. You want it left alone — no synthetic row — with the UI just
noting "didn't clock in" wherever a status would otherwise show. Good news: most of the plumbing
already supports a `null` status gracefully (`build_personal_calendar`, `day_detail_for_user` already
return `status: null` for days with nothing recorded) — this is more removal than addition. Decide
what happens to the `absent` records already created by the shipped version (leave them as historical
fact, or backfill-delete them) before flipping this off.

---

## Tier 2 — Medium (new tables or endpoints, but contained scope)

### Company page
*User's #1.* New page showing org info (name, plan, logo, color scheme once #1's sub-items exist),
editable by super admin only. Needs Tier 0's super admin role first.

### Profile menu + editable profile (approval-gated)
*User's #9.* Icon top-right → profile page showing the user's own editable fields (name, etc.),
where an edit needs admin/super-admin approval before it takes effect. This is structurally a third
instance of the request/approval pattern already used for corrections and leave — a
`profile_edit_requests` table (or reuse `corrections`-style old/new value jsonb) would follow the
same audit-trail shape. Also move Sign out into this menu (trivial, do alongside).

### Notifications
*User's #10.* Start **derived/computed**, not a persisted notification log with read/unread state —
much less to build and it covers everything on your list (needs correction, needs approval, forgot to
clock out) since all of that is already queryable: pending corrections/leave count (admin), own
`missed_clockout` records needing a correction (staff), pending own requests (staff). A `GET
/notifications` that assembles these on read, shown as a badge/dropdown, is a half-day job. Upgrade to
a real persisted table later only if you need push notifications or a read/unread history — don't
build that up front.

### Analytics: absent/week, early-leave/week, cleaner breakdown
*User's #11.* Two things bundled here: (1) `missed_clockout` isn't tracked in `StatusDistribution`/
`DayStatusCounts` at all right now — I deliberately left it out of scope when I added the status to
keep that change small, so it's silently absent from every chart. (2) You want weekly (not just
30-day-total) breakdowns of absent/early-leave specifically. Both are analytics_service.py + schema
changes, no new tables.

### Late grace period
*User's#8.* A "clock in up to N minutes after shift start still counts as present" threshold,
configurable per org. **Needs #7 (shift times) first** — there's no "shift start" to be late relative
to yet; `_determine_clock_in_status()` in `attendance_service.py` is the seam that's been waiting for
exactly this since Phase 1.

### Shift times per employee
*User's #7.* Set per-employee (or per-role?) expected clock-in/out times, editable by admin/super
admin. This is the other half of what unlocks real late/absent detection — right now every clock-in
defaults to `present` because there's nothing to compare against (see the trade-off note in
`README.md`). Once this exists, `_determine_clock_in_status()` stops being a stub.
**Open question:** per-user shift assignment, or shift *templates* assignable to users (more scalable
once a company has more than a handful of staff)?

### Holiday calendar
*User's #4.* Public + religious holidays, set by super admin. A `holidays` table
(org_id, date, name, type) that the closeout job and streak/analytics logic check before treating a
day as a normal working day or a missed day. **Needs super admin (Tier 0)**, and works much better
with #18 (proper working-days) already in place.

---

## Tier 3 — Complex / higher risk (build after their dependencies exist)

### Overtime tracking
*User's #5.* Overtime on a holiday or day off needs to know: is today a holiday (#4)? What was this
person's scheduled shift (#7)? Without both, "overtime" has no baseline to measure against. Once
those exist, this is a computed field (clock_out − scheduled_end, or full duration on a
non-working/holiday day) plus wherever you want it surfaced (analytics, a payroll export, etc. — worth
scoping down before starting, "overtime tracking" can expand a lot).

### Location check (geofencing)
*User's #17.* Verify clock-in/out happened within a super-admin-configured radius of the company
location. Needs the browser Geolocation API (permission prompt, denied-permission fallback UX — don't
hard-block clock-in if geolocation is unavailable/denied without deciding the policy first), a
haversine-distance check server-side (never trust a client-reported "I'm at the office" boolean —
validate the actual coordinates), and org-configurable center point + radius (super admin). Flag for
discussion: single office location, or multiple? Remote/hybrid staff exemption?

---

## Noticed but not on your list

- **No automated tests.** Two real bugs shipped and were only caught by live-testing against the demo
  data this session (auto-`absent` records permanently blocking future clock-ins, twice, in two
  different code paths). Nothing urgent, but the more day-boundary/status logic gets added (grace
  periods, overtime, holidays), the more a small pytest suite around `analytics_service.py` and the
  closeout job would pay for itself.
- **Demo org data is date-backdated from a fixed seed point** and will look increasingly stale as real
  time passes. Eventually worth a small script to keep the trailing ~30 days populated automatically,
  or accept it as a periodic manual touch-up.
- **No password-reset flow for staff** — only the invite flow exists. Fine while the team is you +
  test accounts; worth having before onboarding a real customer.
- **No rate limiting on public endpoints** (`/auth/signup`'s TOTP check, invite sending). Low risk at
  current scale, worth hardening before wider exposure.

---

## Suggested order

1. Tier 0, in the order listed (super admin → working days → timezone)
2. Tier 1, any order — all independent, good filler between bigger items
3. Tier 2, roughly as listed (shift times before grace period; super admin items whenever convenient
   after Tier 0)
4. Tier 3 last

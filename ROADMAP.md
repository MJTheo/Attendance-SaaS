# Roadmap

## Where things stand

**v0.1.1-alpha — Build Phase 1**, shipped 2026-08-08. Live at https://attendance-saa-s.vercel.app.

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

### ~~Super admin role~~ — done, shipped 2026-08-09
*User's #2.* `super_admin` is a distinct `users.role` value (not a flag on `admin`), and
`app.is_admin()` treats it as a superset so every existing admin-gated policy/route/UI check already
covers it — see `isAdmin()` in `frontend/src/lib/api.ts` and `require_admin` in
`backend/app/dependencies.py`. Role changes go through a new `PATCH /admin/users/{id}/role`
(`require_super_admin`-gated) plus a DB-level `users_role_change_guard` trigger — any number of super
admins per org, self-demotion out of super_admin blocked at the DB layer. The org's creator becomes
its first super admin at signup (otherwise a new org would have nobody able to ever promote anyone);
existing orgs' admins were backfilled to super_admin for the same reason. Managed from a new "Team
roles" section on the Team page, visible to super admins only. This unlocks #1, #4, #7, #17, and the
company-page logo/color-scheme item below.

### ~~Configurable working days (arbitrary days, not just "first N")~~ — done, drafted 2026-08-09
*User's #18.* `organizations.working_days` is now a 7-bit mask (bit i = weekday i is a working day,
Monday=0..Sunday=6), replacing the old "5/6/7 = the first N weekdays" int — an org can express e.g.
Tue–Sat now. The mask only exists at the storage boundary (`repositories/organizations.py`'s
`mask_to_days`/`days_to_mask`); everything above that (`compute_streak`, `late_rate_by_weekday`,
the closeout job's non-working-day skip, `PATCH /admin/settings`) works with a plain list of weekday
indices. `Team.tsx`'s settings UI is now a 7-button Mon–Sun toggle row instead of a 5/6/7 dropdown.
**Written but not yet applied/live-tested** — needs migration `20260809100000_working_days_bitmask.sql`
run first (backfills old N values into the equivalent mask, preserving current behavior exactly).
This unlocks #4 (holidays) and #7 (shift times), both of which need a correct "is this a working day"
to build on.

### ~~Timezone handling~~ — done, drafted 2026-08-09
*Not in your list — flagged while building the closeout job.* Every "what day is it" calculation now
converts through `organizations.timezone` (IANA name, e.g. `Asia/Manila`, default `UTC`) instead of
assuming UTC midnight == the org's local midnight: the once-per-day clock-in cap
(`AttendanceService.clock_in`), streaks, the late-rate-by-weekday chart, the personal/team calendar
and day-detail lookups, and the daily closeout job. `analytics_service.py`'s `_to_local_date`/
`local_day_bounds` are the shared conversion points — every caller above them works with plain
`date`/weekday values, same pattern as the working-days mask. The closeout job computes each org's
target day independently as "now in that org's own timezone, minus one day," so correctness doesn't
depend on when in UTC the cron fires or how far an org's offset is from it. Team.tsx's settings
section grew a timezone `<select>` (populated from the browser's own `Intl.supportedValuesOf`) next
to the working-days toggle row — both save independently now (`UpdateOrgSettings` fields are optional).
**Written but not yet applied/live-tested** — needs migration `20260809120000_org_timezone.sql` run
first. This unlocks #4 (holidays), #5 (overtime), #7 (shift times), and #8 (grace period), all of
which get meaningfully harder to reason about correctly without a real notion of "today" to build on.

---

## Tier 1 — Quick wins (no new data model, low risk, can do anytime) — done, drafted 2026-08-09

All seven shipped together as one round, no DB migration needed (pure code — the four Tier 0
migrations were the only schema changes in Build Phase 2 so far).

### ~~Collapse top bar for mobile~~
*User's #6.* `Header.tsx` now has a hamburger button (`sm:hidden`) that toggles the nav between
`hidden` and `flex`; the nav itself stays `sm:flex` so desktop is unaffected. Each `NavLink` closes
the menu on click so navigating doesn't leave it stuck open on mobile.

### ~~Status labels shouldn't show underscores~~
*User's #14.* `formatStatusLabel()` in `StatusDot.tsx` replaces the old `Calendar.tsx`-only
`STATUS_LABEL` map — a curated lookup (not algorithmic, so `missed_clockout` still renders "Missed
clock-out" with the hyphen, not "Missed Clockout") covering every attendance/calendar/workflow status
in the app, with an underscores-to-spaces fallback for anything unlisted. Used everywhere a raw status
string used to leak through: Dashboard/Team history tables, `CorrectionRequestForm`'s status dropdown,
and `CorrectionsList`'s old→new value diff.

### ~~Spelling / capitalization pass~~
*User's #15.* Audited copy across the app (button labels, error messages, placeholders) — already
consistent going in; the real capitalization bugs were the raw status strings above, now fixed.

### ~~Hide clock in/out entirely once done for the day~~
*User's #16.* New `GET /attendance/today` returns the caller's own day detail for the org's local
today (computed server-side, same as `/day/{day}` — the frontend never has to compute "today" itself).
Dashboard shows a "You're done for today" message with a link to request a correction, instead of a
"Clock in" button that would just 409. Found and fixed a related pre-existing bug while testing this:
the hero's `openRecord` lookup didn't exclude `status === 'absent'`, so a historical auto-absent record
(also `clock_out: null` by design) could be picked up as an active open shift.

### ~~Add requester detail to approval cards~~
*User's #3.* `CorrectionsRepository`/`LeaveRequestsRepository.list_all()` now embed
`requester:users!requested_by(name)` (disambiguated — both tables have multiple FKs into `users`) and
flatten it to `requested_by_name`. `CorrectionsList`/`LeaveRequestsList` take a new `showRequester`
prop, on for the admin Approvals pages, off for the personal Requests pages (redundant there — it's
always you).

### ~~Split corrections/leave into two pages on desktop~~
*User's #13.* Went with "always separate, lean on #6's collapsed nav" — `Requests.tsx`/`Approvals.tsx`
are gone, replaced by `LeaveRequests.tsx`/`CorrectionRequests.tsx` and `LeaveApprovals.tsx`/
`CorrectionApprovals.tsx` at `/requests/leave`, `/requests/corrections`, `/approvals/leave`,
`/approvals/corrections`. Old `/requests`/`/approvals` redirect to the `leave` variant for any
existing bookmarks.

### ~~Don't auto-create `absent` rows — describe the gap instead~~
*User's #12.* The closeout job's absent-creation loop is gone; it now only flags `missed_clockout`.
Existing auto-absent rows are left alone as historical fact rather than backfill-deleted — deleting
real historical `attendance_records` outside the corrections flow would itself violate "no silent
edits to attendance records". One real regression this required fixing: `compute_streak` used to
anchor its backward walk on `max(dates_seen)` — the latest date with *any* record — which the old
absent-auto-creation kept fresh every day. Without it, a stale record from days ago could anchor the
walk and report an inflated streak. Fixed by anchoring on "today" (or yesterday, if today has no
record yet) instead — verified with a synthetic stale-record test before it ever shipped.

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

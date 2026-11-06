# Roadmap

## Where things stand

**v0.1.2-alpha — Build Phase 2 (in progress)**, last updated 2026-11-02. Live at https://attendance-saa-s.vercel.app.

- **Build Phase 1 (v0.1.1-alpha, 2026-08-08):** the original 4-phase plan (foundation, corrections +
  admin dashboard, analytics, polish) plus an extra round: sick/annual leave with its own approval
  workflow, personal + team calendars with per-day/per-person drilldown, analytics charts, dedicated
  Requests/Approvals pages, a once-per-day clock-in cap, and a nightly job that flags `missed_clockout`.
- **Build Phase 2 so far:** all of Tier 0 (super admin, arbitrary working days, per-org timezone) and
  Tier 1 (seven quick wins, plus the left-sidebar nav) on 2026-08-09; from Tier 2, the Company page
  and approval-gated profile edits on 2026-11-02 (PRs #2 and #5).
- **Bugs and gaps fixed along the way (2026-11-02):** weekly reports were firing on Tuesday instead of
  Monday (APScheduler numbers weekdays from Monday — PR #3); any admin could change `organizations.plan`
  or anyone's name/email directly through PostgREST (now blocked by DB triggers — PRs #2 and #5); the
  profile request list flashed empty while loading (PR #6).
- **Testing:** an offline pytest suite (`backend/tests`) and a live end-to-end suite (`e2e/`) that
  runs against production as a super admin, admin and staff member in a dedicated test org. Last run:
  API 90/90, UI 40/40. Every migration in `supabase/migrations/` is applied to production.

**Open follow-ups from 2026-11-02:**
- One real email change end to end (request on `/profile` → another admin approves → click the
  confirmation link → login switches). Needs an inbox, so it isn't in the E2E suite.
- Confirm the first Monday-dated weekly report appears by 2026-11-09 (the Tuesday fix, PR #3).
- Supabase Auth: allow `https://attendance-saa-s.vercel.app/profile` as a redirect URL, and decide on
  "Secure email change" (on = both old and new address must confirm, two emails per change).

This file is Build Phase 2 — everything queued up, in the order I'd tackle it and why. It's meant to
be read cold, so each item has enough context to pick back up without re-deriving it.

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

### ~~Configurable working days (arbitrary days, not just "first N")~~ — done, shipped 2026-08-09
*User's #18.* `organizations.working_days` is now a 7-bit mask (bit i = weekday i is a working day,
Monday=0..Sunday=6), replacing the old "5/6/7 = the first N weekdays" int — an org can express e.g.
Tue–Sat now. The mask only exists at the storage boundary (`repositories/organizations.py`'s
`mask_to_days`/`days_to_mask`); everything above that (`compute_streak`, `late_rate_by_weekday`,
the closeout job's non-working-day skip, `PATCH /admin/settings`) works with a plain list of weekday
indices. `Team.tsx`'s settings UI is now a 7-button Mon–Sun toggle row instead of a 5/6/7 dropdown.
**Applied and live-tested** — migration `20260809100000_working_days_bitmask.sql` backfilled old N
values into the equivalent mask, preserving existing behavior exactly.
This unlocks #4 (holidays) and #7 (shift times), both of which need a correct "is this a working day"
to build on.

### ~~Timezone handling~~ — done, shipped 2026-08-09
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
**Applied and live-tested** (migration `20260809120000_org_timezone.sql`; the E2E suite checks that
"today" moves with the org timezone). This unlocks #4 (holidays), #5 (overtime), #7 (shift times), and #8 (grace period), all of
which get meaningfully harder to reason about correctly without a real notion of "today" to build on.

---

## Tier 1 — Quick wins (no new data model, low risk, can do anytime) — done, shipped 2026-08-09

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

### ~~Company page~~ — done, shipped 2026-11-02 (PR #2)
*User's #1.* New `/company` page (admins only, sidebar link after Analytics) backed by one
`GET /admin/organization`: name, plan, created date, headcount by role, plus the org's working days
and timezone. **Org settings moved here from Team.tsx** — same controls, same
`PATCH /admin/settings`, still editable by any admin (CLAUDE.md's "admin → configure org settings").
**Renaming is super-admin-only**: `PATCH /admin/organization` (`require_super_admin`, blocked for the
`demo` plan like invites are) plus a new `organizations_column_guard` DB trigger. That trigger also
closes a gap that predates this page: the organizations RLS update policy is row-level, so any admin
could previously rewrite `plan` (including to/from `demo`) straight through PostgREST — `plan` is now
service-role only. **Applied and live-tested** (migration
`20261102090000_organizations_column_guard.sql`). Logo and color scheme split out below.

### Company logo + color scheme
*Follow-up to #1, deferred to keep the Company page small.* Logo needs a Supabase Storage bucket with
org-scoped storage policies, an `organizations.logo_path` column, upload UI on the Company page, and
the logo shown in the sidebar `Brand`. A per-org color scheme touches the theme tokens and has to
stay out of the 5-color status palette's way (CLAUDE.md design language) — probably accent-only.
Both should be super-admin-only, extending `organizations_column_guard` to cover the new columns.

### ~~Profile menu + editable profile (approval-gated)~~ — done, shipped 2026-11-02 (PRs #5, #6)
*User's #9.* The sidebar's name/role block is now the profile menu (My profile, Sign out) — kept in
the sidebar instead of the "top-right icon" first sketched here, since CLAUDE.md puts all navigation
there. `/profile` lets anyone request a new **name and/or email** with a reason; requests land in a
"Profile change requests" queue on the Team page. New `profile_edit_requests` table, same audit shape
as corrections (old/new jsonb, requester, approver, timestamps), one pending request per person.
**Nobody approves their own request** unless they're the org's only admin-level member — enforced in
the service and by RLS (`app.can_resolve_profile_edit`). An approved **name** is applied by the
service-role client; an approved **email** only unlocks the change — the user sends themselves a
Supabase confirmation link from `/profile`, the login switches when it's clicked, and a trigger on
`auth.users` mirrors it into `public.users.email`. New `users_profile_fields_guard` trigger closes a
gap where any admin could rewrite anyone's name/email straight through PostgREST. Blocked entirely
for the demo org (an email change there would hand over the shared public login). **Known limit:**
Supabase lets any signed-in user call `auth.updateUser({ email })` directly, so the auth-level email
change can't be hard-gated; the sync trigger at least makes it visible in the app. Also, Supabase's
"Secure email change" setting (on by default) emails both old and new addresses — two sends per
change against the free tier's rate limit. **Applied and live-tested** (migration
`20261102100000_profile_edit_requests.sql`), except one real email change end to end — see open
follow-ups at the top.

### Redesign to direction B — built (three PRs)
Claude Design round of 2026-11-02 produced three directions; **B, "warm graphite ledger"**, was
chosen and is fully specified for every screen at desktop and 390px
([canvas](https://claude.ai/code/artifact/0eff596e-9201-481b-bbcb-f412c4fbd55a), page "B — full
design"). Delivered in three PRs: **(1) foundation** — tokens (light default), Instrument Sans + IBM
Plex Mono, an icon per status, the persistent shell (sidebar stays mounted, in-place skeletons —
fixes the full-screen "Loading…" flash), the Inbox button and counts, and the sign-in/sign-up/
onboarding/invite screens; **(2) everyday screens** — Dashboard (today timeline, week-grouped
history), Calendar, my leave/corrections, Profile; **(3) admin screens** — approvals, Team as tabs,
Analytics, Company. `CLAUDE.md`'s design language now describes B. PR 2 also extends `/auth/me` with
the org's working days and the personal calendar with each day's times/leave reason, and adds the
approver name and corrected record's date to the request lists. PR 3 rebuilds the approval queues (shared
`ApprovalQueue`: "Waiting for you" cards, a confirmation toast, the resolved list), turns Team into
tabs (Attendance grid by day/week/month, profile-change Requests, Roles for super admins, Invite),
restyles Analytics (the trend now plots a server-side `present_rate`, and the distribution counts
missed clock-outs) and Company (a Save changes button instead of saving on every click, timezone
offsets in the picker, demo detection by `plan` instead of the demo login's email).

### ~~Notifications~~ — done: counts with the redesign (PR #8), Inbox page after it
`GET /notifications` derives the counts on read (sidebar Inbox badge, Leave/Corrections menus), and
`GET /notifications/inbox` returns the items behind them, from the same function, so the badge and
the page can't disagree. The `/inbox` page is one queue: your own missed clock-outs (with the
correction form inline) and, for admins, every pending leave, correction and profile change they may
resolve, each approvable in place. Not included: your own pending requests ("waiting on your admin")
— they aren't counted as waiting on *you*; add them if staff ask.
*User's #10.* Start **derived/computed**, not a persisted notification log with read/unread state —
much less to build and it covers everything on your list (needs correction, needs approval, forgot to
clock out) since all of that is already queryable: pending corrections/leave count (admin), own
`missed_clockout` records needing a correction (staff), pending own requests (staff). A `GET
/notifications` that assembles these on read, shown as a badge/dropdown, is a half-day job. Upgrade to
a real persisted table later only if you need push notifications or a read/unread history — don't
build that up front.

### ~~Analytics: absent/week, early-leave/week, cleaner breakdown~~ — done
*User's #11.* The Analytics page has a **By week** card (absent and early leave per week as grouped
bars, plus a table of every status and the present rate for each of the last 8 Monday-to-Sunday weeks)
and a **By person** grid (each member's absences and early leaves per week). `missed_clockout` is now
in every count, the team calendar's per-day counts included. The team summary covers the same last 30
days as the rest of the page (it used to count the latest 2,000 records, all-time) and its late rate
is late ÷ days clocked in. Left as is: the weekday late-rate chart still reads the latest 2,000 records.

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

- **Automated tests — started, still thin.** A pytest suite now exists (`backend/tests`,
  `requirements-dev.txt`; runs with no Supabase, repositories faked via `monkeypatch` +
  FastAPI `dependency_overrides`). It covers org schemas, the working-days mask, and the
  Company page routes' role gating. A live end-to-end suite (`e2e/`) now also runs against
  production as a super admin, admin and staff member in a dedicated test org — role gating, the
  DB triggers/RLS hit directly, corrections, leave, timezone, profile edits, and tenant isolation.
  Still missing, and the most valuable next: `analytics_service.py`
  (streaks, timezone day-bucketing) and the closeout job — two real bugs shipped there before
  (auto-`absent` records blocking future clock-ins, twice) and grace periods/overtime/holidays will
  add more day-boundary logic on top.
- **Demo org data is date-backdated from a fixed seed point** and will look increasingly stale as real
  time passes. Eventually worth a small script to keep the trailing ~30 days populated automatically,
  or accept it as a periodic manual touch-up.
- **Supabase's built-in mailer sends only ~2 emails/hour.** Invites, email-change confirmations
  and (later) password resets all share it. Configure a custom SMTP provider in Supabase before
  onboarding a real customer.
- **No password-reset flow for staff** — only the invite flow exists. Fine while the team is you +
  test accounts; worth having before onboarding a real customer.
- **No rate limiting on public endpoints** (`/auth/signup`'s TOTP check, invite sending). Low risk at
  current scale, worth hardening before wider exposure.

---

## Suggested order

Tier 0 and Tier 1 are done, and so are the Company page and profile edits from Tier 2. Next, in this
order:

1. ~~**Notifications**~~ — done (counts + Inbox page).
2. ~~**Analytics: weekly breakdowns**~~ — done (By week, By person, 30-day team summary).
3. **Tests for `analytics_service.py` and the closeout job** (from "noticed" above, small) — before
   shift times, grace periods, holidays and overtime pile more day-boundary rules onto that code.
4. **Shift times per employee** (Tier 2, medium–large) — the biggest unlock: real late/absent
   detection. **Decide first:** per-person shifts, or shift templates assigned to people.
5. **Late grace period** (Tier 2, small once 4 exists).
6. **Holiday calendar** (Tier 2, medium).
7. **Overtime tracking** (Tier 3) — needs 4 and 6; scope it down before starting.
8. **Location check / geofencing** (Tier 3, large) — **decide first:** denied-permission policy,
   one office or several, remote-staff exemption.

- **Anytime:** Company logo + color scheme (Tier 2 follow-up).
- **Before the first real customer:** custom SMTP, a staff password-reset flow, rate limiting on
  public endpoints, and keeping the demo org's data fresh (it currently ends 2026-08-09).

# Live end-to-end suite

Checks a **deployed** Landas Time (production by default) through the real
frontend, API and database, as real accounts. It complements the fast,
offline `backend/tests` pytest suite: that one fakes the database, this one
proves the deployed RLS policies, triggers and role gating actually hold.

| Script | What it covers |
|---|---|
| `live_api.py` | Role gating on every admin route; DB-layer guards hit directly through PostgREST (column guard, role guard, profile-field guard, no silent edits); rename, working days, timezone moving "today"; clock in/out and the once-per-day cap; corrections with audit trail; leave approve/reject on the calendar; role promotion/demotion; approval-gated profile edits (name applied on approval and reverted the same way, no self-approval, email confirmation gating, demo org blocked); tenant isolation against the public demo org |
| `live_ui.cjs` | What each role sees: staff nav and redirects, profile menu and My profile page, admin pages (including the profile-change queue), super-admin rename and roles table, dropcards, theme toggle, mobile drawer, and the public "View live demo" login |

## It writes to production

Use a **dedicated test org**, never a real customer's. Each run of
`live_api.py`, in that test org only:

- clocks each of the three accounts in and out (once per day — a second run
  the same day just checks the 409);
- files two corrections on the staff member's latest record (one approved,
  marking it late; one rejected);
- files two leave requests about five weeks out (one approved, one rejected);
- files profile change requests: the staff member's name is changed and changed back
  (both approved), an admin's own request and an email change are rejected. No
  confirmation email is ever sent.

Everything else it changes (org name, working days, timezone, the staff
member's role) is put back at the end, even if a check fails. Against the
public demo org it only reads. `live_ui.cjs` renames the test org through the
UI and immediately renames it back.

## Setup

1. Create a test org at `/signup` (you become its super admin), plus an admin
   and a staff member — via **Team → Invite**, or without email: create the
   two logins in Supabase **Authentication → Users** with *Auto Confirm User*,
   then insert their `public.users` rows with the right `org_id` and `role`.
2. Export the logins (keep them out of the repo — e.g. your shell, a gitignored
   `.env`, or the cloud environment's settings):

   ```bash
   export E2E_SUPERADMIN_EMAIL=... E2E_SUPERADMIN_PASSWORD=...
   export E2E_ADMIN_EMAIL=...      E2E_ADMIN_PASSWORD=...
   export E2E_STAFF_EMAIL=...      E2E_STAFF_PASSWORD=...
   ```

Optional: `E2E_BASE_URL` (frontend, default the production Vercel URL) and
`E2E_API_URL` (only if it can't be found in the frontend bundle). The API and
Supabase URLs and the publishable key are read from the deployed bundle; the
public demo login is read from `frontend/src/lib/demo.ts`.

## Run

From the repo root:

```bash
python3 e2e/live_api.py
```

```bash
cd e2e && npm install && npx playwright install chromium && node live_ui.cjs
```

Run the API suite first so the UI suite has request data to look at. Both
print one PASS/FAIL line per check and exit non-zero if anything failed;
screenshots land in `e2e/output/` (gitignored).

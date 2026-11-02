"""Live end-to-end API + database suite against a deployed Landas Time.

Runs as three real accounts in a dedicated test org (super_admin / admin /
staff) and checks role gating, DB-layer guards, settings + timezone handling,
clock in/out, corrections, leave, role management, and tenant isolation
against the public demo org (read-only there).

WRITES TO PRODUCTION (test org only): a clock-in/out per account per day,
two corrections, two leave requests per run. Settings it changes are
restored at the end. See e2e/README.md.

Usage (stdlib only, Python 3.11+):
    E2E_SUPERADMIN_EMAIL=... E2E_SUPERADMIN_PASSWORD=... \
    E2E_ADMIN_EMAIL=...      E2E_ADMIN_PASSWORD=... \
    E2E_STAFF_EMAIL=...      E2E_STAFF_PASSWORD=... \
    python e2e/live_api.py
"""

import json
import os
import re
import sys
import urllib.error
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

BASE_URL = os.environ.get("E2E_BASE_URL", "https://attendance-saa-s.vercel.app").rstrip("/")
REPO_ROOT = Path(__file__).resolve().parent.parent
RESULTS: list[tuple[str, str, bool, str]] = []


# ---------------------------------------------------------------------------
# plumbing


def http(method: str, url: str, body=None, headers=None):
    request = urllib.request.Request(
        url,
        method=method,
        headers={"Content-Type": "application/json", **(headers or {})},
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw = response.read().decode()
            return response.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode()
        try:
            return exc.code, json.loads(raw)
        except ValueError:
            return exc.code, raw


def discover_config() -> dict:
    """Read the API base URL, Supabase URL and publishable key out of the
    deployed frontend bundle, so nothing environment-specific is hardcoded."""
    with urllib.request.urlopen(BASE_URL + "/", timeout=30) as response:
        html = response.read().decode()
    bundle_path = re.search(r'src="(/assets/[^"]+\.js)"', html).group(1)
    with urllib.request.urlopen(BASE_URL + bundle_path, timeout=30) as response:
        bundle = response.read().decode()
    supabase_url = re.search(r"https://[a-z0-9]+\.supabase\.co", bundle).group(0)
    key = re.search(r"sb_publishable_[A-Za-z0-9_-]+", bundle).group(0)
    # The API base is the only other absolute https URL the app calls.
    candidates = set(re.findall(r"https://[a-zA-Z0-9.-]+\.(?:railway\.app|onrender\.com)", bundle))
    api_url = os.environ.get("E2E_API_URL") or (candidates.pop() if len(candidates) == 1 else None)
    if not api_url:
        sys.exit(f"Couldn't identify the API URL in the bundle ({candidates}); set E2E_API_URL")
    return {"api": api_url, "supabase": supabase_url, "key": key}


def demo_credentials() -> tuple[str, str]:
    """The public demo login is intentionally shared and lives in the frontend;
    read it from there rather than repeating it here."""
    source = (REPO_ROOT / "frontend/src/lib/demo.ts").read_text()
    email = re.search(r"DEMO_ADMIN_EMAIL = '([^']+)'", source).group(1)
    password = re.search(r"DEMO_ADMIN_PASSWORD = '([^']+)'", source).group(1)
    return email, password


class Account:
    def __init__(self, label: str, email: str, password: str):
        status, token = http(
            "POST", f"{CONFIG['supabase']}/auth/v1/token?grant_type=password",
            {"email": email, "password": password}, {"apikey": CONFIG["key"]},
        )
        if status != 200:
            sys.exit(f"Login failed for {label} ({status}) — check the E2E_* variables")
        self.label = label
        self.token = token["access_token"]
        self.me = self.api("GET", "/auth/me")[1]

    def api(self, method: str, path: str, body=None):
        return http(method, CONFIG["api"] + path, body, {"Authorization": f"Bearer {self.token}"})

    def db(self, method: str, path: str, body=None):
        """Direct PostgREST call as this user — bypasses the API to prove the
        database itself enforces the rule."""
        return http(method, f"{CONFIG['supabase']}/rest/v1{path}", body, {
            "apikey": CONFIG["key"], "Authorization": f"Bearer {self.token}", "Prefer": "return=representation",
        })


def check(area: str, name: str, ok, detail="") -> bool:
    ok = bool(ok)
    RESULTS.append((area, name, ok, str(detail)[:200]))
    suffix = f"  — {str(detail)[:200]}" if detail != "" else ""
    print(f"{'PASS' if ok else 'FAIL'} [{area}] {name}{suffix}", flush=True)
    return ok


def section(area: str, fn) -> None:
    try:
        fn()
    except Exception as exc:  # a crashed section is a failure, keep going
        check(area, "section crashed", False, repr(exc))


def local_today(tz_name: str) -> str:
    return datetime.now(ZoneInfo(tz_name)).date().isoformat()


# ---------------------------------------------------------------------------
# setup

for var in ("SUPERADMIN", "ADMIN", "STAFF"):
    for part in ("EMAIL", "PASSWORD"):
        if not os.environ.get(f"E2E_{var}_{part}"):
            sys.exit(f"Missing E2E_{var}_{part} — see e2e/README.md")

CONFIG = discover_config()
print(f"frontend {BASE_URL}\napi      {CONFIG['api']}\nsupabase {CONFIG['supabase']}\n")

sup = Account("super_admin", os.environ["E2E_SUPERADMIN_EMAIL"], os.environ["E2E_SUPERADMIN_PASSWORD"])
adm = Account("admin", os.environ["E2E_ADMIN_EMAIL"], os.environ["E2E_ADMIN_PASSWORD"])
stf = Account("staff", os.environ["E2E_STAFF_EMAIL"], os.environ["E2E_STAFF_PASSWORD"])
demo = Account("demo_admin", *demo_credentials())
ORG = sup.me["org_id"]
_, ORIGINAL = sup.api("GET", "/admin/organization")
print(f"test org {ORIGINAL['name']!r}: tz={ORIGINAL['timezone']} days={ORIGINAL['working_days']}\n")

# Leave dates relative to today so the suite keeps working over time.
LEAVE_START = date.today() + timedelta(days=35)


# ---------------------------------------------------------------------------
# checks


def accounts():
    roles = (sup.me["role"], adm.me["role"], stf.me["role"])
    check("accounts", "Roles are super_admin / admin / staff", roles == ("super_admin", "admin", "staff"), roles)
    check("accounts", "All three share one org, which isn't the demo org",
          sup.me["org_id"] == adm.me["org_id"] == stf.me["org_id"] != demo.me["org_id"])
    check("accounts", "Test org isn't on the demo plan", ORIGINAL["plan"] != "demo", ORIGINAL["plan"])


def gating():
    today = local_today(ORIGINAL["timezone"])
    for path in ["/admin/attendance", "/admin/analytics", "/admin/calendar?year=2026&month=1", f"/admin/day/{today}",
                 "/admin/users", "/admin/settings", "/admin/organization", "/admin/reports"]:
        codes = (sup.api("GET", path)[0], adm.api("GET", path)[0], stf.api("GET", path)[0])
        check("gating", f"GET {path.split('?')[0]}: super/admin 200, staff 403", codes == (200, 200, 403), codes)
    check("gating", "Staff can't change settings", stf.api("PATCH", "/admin/settings", {"timezone": "UTC"})[0] == 403)
    check("gating", "Staff can't rename the org", stf.api("PATCH", "/admin/organization", {"name": "x"})[0] == 403)
    check("gating", "Admin can't rename the org (super admin only)",
          adm.api("PATCH", "/admin/organization", {"name": "x"})[0] == 403)
    check("gating", "Admin can't change roles",
          adm.api("PATCH", f"/admin/users/{stf.me['id']}/role", {"role": "admin"})[0] == 403)
    check("gating", "Staff can't invite",
          stf.api("POST", "/admin/invite", {"email": "nobody@example.com", "name": "x"})[0] == 403)


def db_guards():
    status, body = adm.db("PATCH", f"/organizations?id=eq.{ORG}", {"name": "Renamed directly"})
    check("db", "Admin direct rename refused (organizations_column_guard)", status >= 400, f"{status} {body}")
    status, body = sup.db("PATCH", f"/organizations?id=eq.{ORG}", {"plan": "enterprise"})
    if status < 400:  # guard missing: put it back before reporting
        sup.db("PATCH", f"/organizations?id=eq.{ORG}", {"plan": ORIGINAL["plan"]})
    check("db", "Direct plan change refused for every end user", status >= 400, f"{status} {body}")
    status, body = stf.db("PATCH", f"/organizations?id=eq.{ORG}", {"timezone": "UTC"})
    check("db", "Staff direct org update matches 0 rows (RLS)", status == 200 and body == [], f"{status} {body}")
    status, body = adm.db("PATCH", f"/users?id=eq.{stf.me['id']}", {"role": "admin"})
    check("db", "Admin direct role change refused (users_role_change_guard)", status >= 400, status)
    status, body = stf.db("PATCH", f"/users?id=eq.{stf.me['id']}", {"role": "super_admin"})
    check("db", "Staff self-promotion refused", status >= 400 or body == [], status)
    _, history = stf.api("GET", "/attendance/me")
    closed = next((r for r in history if r.get("clock_out")), None)
    if closed:
        status, body = stf.db("PATCH", f"/attendance_records?id=eq.{closed['id']}", {"notes": "edited directly"})
        check("db", "Direct edit of a closed attendance record matches 0 rows (rule 2)", body == [], status)
    _, rows = sup.db("GET", f"/organizations?id=eq.{ORG}&select=name,plan")
    check("db", "Re-read: org name and plan unchanged", rows[0] == {"name": ORIGINAL["name"], "plan": ORIGINAL["plan"]})


def settings():
    _, org = sup.api("PATCH", "/admin/organization", {"name": f"  {ORIGINAL['name']} (renamed)  "})
    check("settings", "Super admin rename, trimmed", org.get("name") == f"{ORIGINAL['name']} (renamed)", org.get("name"))
    _, org = sup.api("PATCH", "/admin/organization", {"name": ORIGINAL["name"]})
    check("settings", "Rename back", org.get("name") == ORIGINAL["name"])
    toggled = sorted(set(ORIGINAL["working_days"]) ^ {6})
    _, s = adm.api("PATCH", "/admin/settings", {"working_days": toggled})
    check("settings", "Admin changes working days", s["working_days"] == toggled, s["working_days"])
    # UTC-11 and UTC+14 are always on different calendar dates, so "today"
    # must move with the org timezone whatever time the suite runs.
    for tz in ("Pacific/Pago_Pago", "Pacific/Kiritimati"):
        adm.api("PATCH", "/admin/settings", {"timezone": tz})
        _, today = stf.api("GET", "/attendance/today")
        check("settings", f"Timezone {tz}: staff 'today' is {local_today(tz)}", today["date"] == local_today(tz), today["date"])
    check("settings", "Invalid timezone rejected", adm.api("PATCH", "/admin/settings", {"timezone": "Mars/Base"})[0] == 422)
    check("settings", "Empty working days rejected", adm.api("PATCH", "/admin/settings", {"working_days": []})[0] == 422)
    adm.api("PATCH", "/admin/settings", {"working_days": ORIGINAL["working_days"], "timezone": ORIGINAL["timezone"]})


CLOCK_NOTES = {
    "staff": "Opened the front desk",
    "admin": "Covered the morning stand-up",
    "super_admin": "Reviewed the weekly schedule",
}


def clocking():
    for who in (stf, adm, sup):
        _, today = who.api("GET", "/attendance/today")
        if today.get("clock_out"):
            check("clock", f"{who.label}: already clocked in and out today (cap)", who.api("POST", "/attendance/clock-in")[0] == 409)
            continue
        if not today.get("clock_in"):
            status, _ = who.api("POST", "/attendance/clock-in")
            check("clock", f"{who.label}: clock in", status == 201, status)
        status, _ = who.api("PATCH", "/attendance/clock-out", {"notes": CLOCK_NOTES[who.label]})
        check("clock", f"{who.label}: clock out", status == 200, status)
        check("clock", f"{who.label}: second clock-in the same day refused", who.api("POST", "/attendance/clock-in")[0] == 409)
    _, streak = stf.api("GET", "/attendance/streak")
    check("clock", "Staff streak is at least 1", streak["current_streak"] >= 1, streak)
    _, day = adm.api("GET", f"/admin/day/{local_today(ORIGINAL['timezone'])}")
    check("clock", "Team day view has a record for all three", sum(1 for d in day if d["status"]) >= 3,
          [(d["name"], d["status"]) for d in day])


def corrections():
    _, history = stf.api("GET", "/attendance/me")
    target = next(r for r in history if r.get("clock_out"))
    # Pick whichever note differs from the current one, so a same-day re-run
    # (same record) still makes a real change for the correction to apply.
    note = next(n for n in ("Late — heavy traffic on the way in", "Late — train was delayed") if n != target.get("notes"))
    status, request = stf.api("POST", "/corrections", {
        "attendance_record_id": target["id"], "reason": "I was late because of heavy traffic",
        "new_value": {"status": "late", "notes": note},
    })
    check("corrections", "Staff submits a correction", status == 201 and request["status"] == "pending", status)
    _, admin_history = adm.api("GET", "/attendance/me")
    status, _ = stf.api("POST", "/corrections", {
        "attendance_record_id": admin_history[0]["id"], "reason": "Not my record", "new_value": {"notes": "x"},
    })
    check("corrections", "Staff can't correct someone else's record", status >= 400, status)
    check("corrections", "Staff can't approve", stf.api("PATCH", f"/corrections/{request['id']}/approve")[0] == 403)
    _, pending = adm.api("GET", "/corrections")
    row = next((c for c in pending if c["id"] == request["id"]), {})
    check("corrections", "Admin sees it with the requester's name", row.get("requested_by_name") == stf.me["name"])
    status, approved = adm.api("PATCH", f"/corrections/{request['id']}/approve")
    check("corrections", "Approval records approver, old/new value and time",
          status == 200 and approved["approved_by"] == adm.me["id"] and approved["resolved_at"]
          and approved["new_value"].get("status") == "late" and "status" in approved["old_value"],
          f"old={approved.get('old_value')} new={approved.get('new_value')}")
    _, history = stf.api("GET", "/attendance/me")
    record = next(r for r in history if r["id"] == target["id"])
    check("corrections", "Record updated through the correction", (record["status"], record["notes"]) == ("late", note))
    check("corrections", "Re-approving is refused", adm.api("PATCH", f"/corrections/{request['id']}/approve")[0] == 409)
    _, second = stf.api("POST", "/corrections", {
        "attendance_record_id": target["id"], "reason": "Please mark me present instead",
        "new_value": {"status": "present"},
    })
    status, rejected = sup.api("PATCH", f"/corrections/{second['id']}/reject")
    check("corrections", "Super admin rejects a correction", status == 200 and rejected["status"] == "rejected")
    _, history = stf.api("GET", "/attendance/me")
    check("corrections", "Rejected correction changed nothing",
          next(r for r in history if r["id"] == target["id"])["status"] == "late")
    _, mine = stf.api("GET", "/corrections")
    check("corrections", "Staff only see their own corrections", all(c["requested_by"] == stf.me["id"] for c in mine))
    _, analytics = adm.api("GET", "/admin/analytics")
    summary = next((u for u in analytics["users"] if u["user_id"] == stf.me["id"]), {})
    check("corrections", "Analytics counts the late record", summary.get("late", 0) >= 1, summary)


def leave():
    start, end = LEAVE_START, LEAVE_START + timedelta(days=1)
    status, sick = stf.api("POST", "/leave", {
        "leave_type": "sick", "start_date": start.isoformat(), "end_date": end.isoformat(),
        "reason": "Flu — doctor's note to follow",
    })
    check("leave", "Staff requests sick leave", status == 201 and sick["status"] == "pending", status)
    check("leave", "Staff can't approve leave", stf.api("PATCH", f"/leave/{sick['id']}/approve")[0] == 403)
    status, approved = adm.api("PATCH", f"/leave/{sick['id']}/approve")
    check("leave", "Admin approves it", status == 200 and approved["approved_by"] == adm.me["id"])
    _, calendar = stf.api("GET", f"/attendance/calendar?year={start.year}&month={start.month}")
    check("leave", "Staff calendar shows sick_leave",
          {d["date"]: d["status"] for d in calendar}.get(start.isoformat()) == "sick_leave")
    _, drilldown = adm.api("GET", f"/admin/calendar/{stf.me['id']}?year={start.year}&month={start.month}")
    check("leave", "Admin drilldown shows it too",
          {d["date"]: d["status"] for d in drilldown}.get(start.isoformat()) == "sick_leave")
    later = LEAVE_START + timedelta(days=14)
    _, annual = stf.api("POST", "/leave", {
        "leave_type": "annual", "start_date": later.isoformat(), "end_date": later.isoformat(),
        "reason": "Family holiday",
    })
    status, rejected = sup.api("PATCH", f"/leave/{annual['id']}/reject")
    check("leave", "Super admin rejects annual leave", status == 200 and rejected["status"] == "rejected")
    _, calendar = stf.api("GET", f"/attendance/calendar?year={later.year}&month={later.month}")
    check("leave", "Rejected leave stays off the calendar",
          {d["date"]: d["status"] for d in calendar}.get(later.isoformat()) is None)
    _, mine = stf.api("GET", "/leave")
    check("leave", "Staff only see their own leave", all(l["user_id"] == stf.me["id"] for l in mine))
    check("leave", "End before start rejected", stf.api("POST", "/leave", {
        "leave_type": "annual", "start_date": later.isoformat(), "end_date": start.isoformat(), "reason": "x",
    })[0] == 422)


def roles():
    check("roles", "Super admin can't demote themselves",
          sup.api("PATCH", f"/admin/users/{sup.me['id']}/role", {"role": "admin"})[0] == 400)
    sup.api("PATCH", f"/admin/users/{stf.me['id']}/role", {"role": "admin"})
    check("roles", "Promotion takes effect immediately", stf.api("GET", "/admin/users")[0] == 200)
    sup.api("PATCH", f"/admin/users/{stf.me['id']}/role", {"role": "staff"})
    check("roles", "Demotion takes effect immediately", stf.api("GET", "/admin/users")[0] == 403)
    _, org = sup.api("GET", "/admin/organization")
    _, users = sup.api("GET", "/admin/users")
    counts = Counter(u["role"] for u in users)
    check("roles", "Company headcount matches the member list",
          org["member_counts"] == {r: counts.get(r, 0) for r in ("staff", "admin", "super_admin")}, org["member_counts"])


def isolation():
    tables = {"organizations": "id", "users": "org_id", "attendance_records": "org_id",
              "corrections": "org_id", "leave_requests": "org_id", "reports": "org_id"}
    for who in (sup, adm, stf):
        leaks = {t: n for t, col in tables.items()
                 if (n := len({r[col] for r in who.db("GET", f"/{t}?select={col}")[1]} - {ORG}))}
        check("isolation", f"{who.label}: every table returns own-org rows only", not leaks, leaks or "")
        _, rows = who.db("GET", f"/attendance_records?org_id=eq.{demo.me['org_id']}&select=id")
        check("isolation", f"{who.label}: filtering on the demo org returns nothing", rows == [], len(rows))
    leaks = [t for t, col in tables.items() if ORG in {r[col] for r in demo.db("GET", f"/{t}?select={col}")[1]}]
    check("isolation", "Demo admin sees nothing from the test org", not leaks, leaks or "")
    _, demo_corrections = demo.api("GET", "/corrections")
    if demo_corrections:
        check("isolation", "Can't resolve another org's correction",
              adm.api("PATCH", f"/corrections/{demo_corrections[0]['id']}/approve")[0] == 404)
    demo.api("PATCH", f"/admin/users/{stf.me['id']}/role", {"role": "admin"})
    check("isolation", "Another org's super admin can't change our roles", stf.api("GET", "/auth/me")[1]["role"] == "staff")
    _, calendar = adm.api("GET", f"/admin/calendar/{demo.me['id']}?year={date.today().year}&month={date.today().month}")
    check("isolation", "Calendar drilldown on another org's user reveals nothing", all(d["status"] is None for d in calendar))
    _, demo_history = demo.api("GET", "/attendance/me")
    if demo_history:
        status, _ = stf.api("POST", "/corrections", {"attendance_record_id": demo_history[0]["id"], "reason": "x",
                                                      "new_value": {"notes": "x"}})
        check("isolation", "Can't file a correction on another org's record", status >= 400, status)
    status, _ = stf.db("POST", "/attendance_records", {"org_id": demo.me["org_id"], "user_id": stf.me["id"],
                                                       "clock_in": datetime.now(timezone.utc).isoformat()})
    check("isolation", "Can't insert attendance into another org (DB)", status >= 400, status)
    status, _ = stf.db("POST", "/users", {"id": stf.me["id"], "org_id": demo.me["org_id"], "role": "super_admin",
                                          "name": "x", "email": "x@example.com"})
    check("isolation", "Can't add yourself to another org (DB)", status >= 400, status)


try:
    for area, fn in [("accounts", accounts), ("gating", gating), ("db", db_guards), ("settings", settings),
                     ("clock", clocking), ("corrections", corrections), ("leave", leave), ("roles", roles),
                     ("isolation", isolation)]:
        section(area, fn)
finally:
    sup.api("PATCH", "/admin/organization", {"name": ORIGINAL["name"]})
    sup.api("PATCH", "/admin/settings", {"working_days": ORIGINAL["working_days"], "timezone": ORIGINAL["timezone"]})
    sup.api("PATCH", f"/admin/users/{stf.me['id']}/role", {"role": "staff"})
    _, final = sup.api("GET", "/admin/organization")
    check("cleanup", "Org name, timezone and working days restored",
          (final["name"], final["timezone"], final["working_days"])
          == (ORIGINAL["name"], ORIGINAL["timezone"], ORIGINAL["working_days"]))

failed = [r for r in RESULTS if not r[2]]
print(f"\n{len(RESULTS)} checks, {len(RESULTS) - len(failed)} passed, {len(failed)} failed")
sys.exit(1 if failed else 0)

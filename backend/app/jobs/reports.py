from datetime import datetime, timedelta, timezone

from supabase import Client

from app.repositories.reports import ReportsRepository


def _summarize(records: list[dict], period_start: datetime, period_end: datetime) -> dict:
    org_totals = {"present": 0, "late": 0, "early_leave": 0, "absent": 0}
    per_user: dict[str, dict] = {}

    for record in records:
        status = record["status"]
        org_totals[status] = org_totals.get(status, 0) + 1

        user = record.get("users") or {}
        user_id = record["user_id"]
        entry = per_user.setdefault(
            user_id,
            {
                "user_id": user_id,
                "name": user.get("name", ""),
                "present": 0,
                "late": 0,
                "early_leave": 0,
                "absent": 0,
                "total": 0,
            },
        )
        entry[status] = entry.get(status, 0) + 1
        entry["total"] += 1

    users = list(per_user.values())
    for entry in users:
        entry["late_rate"] = round(entry["late"] / entry["total"], 3) if entry["total"] else 0.0

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "org_totals": {**org_totals, "total_records": len(records)},
        "users": users,
    }


def generate_weekly_reports(service_client: Client) -> None:
    """Runs on REPORT_SCHEDULE_CRON. Service-role only: this has no
    authenticated caller to scope RLS to, and needs to iterate every org.
    One of the small number of documented service-role call sites — see
    get_service_role_client's docstring."""
    period_end = datetime.now(timezone.utc)
    period_start = period_end - timedelta(days=7)
    reports = ReportsRepository(service_client)

    orgs = service_client.table("organizations").select("id").execute().data
    for org in orgs:
        org_id = org["id"]
        records = (
            service_client.table("attendance_records")
            .select("*, users(name)")
            .eq("org_id", org_id)
            .gte("clock_in", period_start.isoformat())
            .lt("clock_in", period_end.isoformat())
            .execute()
            .data
        )
        payload = _summarize(records, period_start, period_end)
        reports.create(org_id, "weekly_summary", payload)

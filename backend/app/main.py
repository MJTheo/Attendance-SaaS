from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.dependencies import get_service_role_client
from app.jobs.closeout import close_out_previous_day
from app.jobs.reports import generate_weekly_reports
from app.routers import admin, attendance, auth, corrections, leave

settings = get_settings()

scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        lambda: generate_weekly_reports(get_service_role_client()),
        CronTrigger.from_crontab(settings.report_schedule_cron),
        id="weekly_reports",
        replace_existing=True,
    )
    scheduler.add_job(
        lambda: close_out_previous_day(get_service_role_client()),
        CronTrigger.from_crontab(settings.daily_closeout_cron),
        id="daily_closeout",
        replace_existing=True,
    )
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Landas Time API", version="0.1.0-alpha", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(attendance.router)
app.include_router(corrections.router)
app.include_router(leave.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}

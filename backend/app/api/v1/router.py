from fastapi import APIRouter
from app.api.v1.routes import (
    resume, jobs, analysis, mentors, insights, improve, intelligence, auth,
    job_applications, settings,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(resume.router)
api_router.include_router(jobs.router)
api_router.include_router(analysis.router)
api_router.include_router(mentors.router)
api_router.include_router(insights.router)
api_router.include_router(improve.router)
api_router.include_router(intelligence.router)
api_router.include_router(job_applications.router)
api_router.include_router(settings.router)

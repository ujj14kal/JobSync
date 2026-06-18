from fastapi import APIRouter
from app.api.v1.routes import (
    resume, jobs, analysis, insights, improve, intelligence, auth,
    job_applications, settings, feedback, model_mgmt, interview, resume_builder,
    payments, chat, public,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router)
api_router.include_router(resume.router)
api_router.include_router(jobs.router)
api_router.include_router(analysis.router)
api_router.include_router(insights.router)
api_router.include_router(improve.router)
api_router.include_router(intelligence.router)
api_router.include_router(job_applications.router)
api_router.include_router(settings.router)
api_router.include_router(feedback.router)
api_router.include_router(model_mgmt.router)
api_router.include_router(interview.router)
api_router.include_router(resume_builder.router)
api_router.include_router(payments.router)
api_router.include_router(chat.router)
api_router.include_router(public.router)

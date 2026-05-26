"""Career insights endpoints."""
from fastapi import APIRouter, Depends
from app.core.security import get_current_user_id
from app.services.career_insights import get_career_insights

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("")
async def get_insights(
    role: str = "Software Engineer",
    industry: str = "Technology",
    user_id: str = Depends(get_current_user_id),
):
    """Get career insights for a role."""
    return await get_career_insights(role=role, industry=industry)

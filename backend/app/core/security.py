from fastapi import HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
import httpx
from app.core.config import settings

security = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> dict:
    """
    Validates Supabase JWT and returns a user dict with 'sub' (UUID) and 'email'.
    Used by routes that need user metadata (analysis, intelligence).
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
        )

    token = credentials.credentials

    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False},
        )
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token",
            )
        return {
            "sub": user_id,
            "email": payload.get("email", ""),
        }
    except JWTError:
        try:
            user_data = await _verify_supabase_jwt(token)
            return user_data
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
            )


async def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> str:
    """
    Lightweight variant — returns only the user UUID string.
    Used by routes that only need the ID (resume, jobs, insights, improve).
    """
    user = await get_current_user(credentials)
    return user["sub"]


async def _verify_supabase_jwt(token: str) -> dict:
    """Verify token against Supabase Auth and return user dict."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{settings.SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": settings.SUPABASE_ANON_KEY,  # required by Supabase Kong gateway
            },
            timeout=10,
        )
        if resp.status_code != 200:
            raise ValueError("Invalid Supabase token")
        data = resp.json()
        return {
            "sub": data["id"],
            "email": data.get("email", ""),
        }

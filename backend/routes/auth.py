from fastapi import APIRouter, HTTPException, status, Request, Depends
from bson import ObjectId
from datetime import datetime, timezone
from config import get_db
from models.user import UserCreate, UserLogin, TokenResponse, UserResponse
from services.auth_service import hash_password, verify_password, create_access_token
from middleware.auth_middleware import get_current_user
from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _format_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "name": user["name"],
        "email": user["email"],
        "onboarding_complete": user.get("onboarding_complete", False),
        "created_at": user["created_at"],
        "preferences": user.get("preferences"),
        "college": user.get("college"),
        "academic_year": user.get("academic_year"),
    }


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def signup(request: Request, body: UserCreate):
    db = get_db()
    existing = await db.users.find_one({"email": body.email.lower()})
    if existing:
        raise HTTPException(status_code=400, detail="An account with this email already exists")

    hashed = hash_password(body.password)
    now = datetime.now(timezone.utc)
    user_doc = {
        "name": body.name.strip(),
        "email": body.email.lower(),
        "password_hash": hashed,
        "onboarding_complete": False,
        "created_at": now,
        "updated_at": now,
        "preferences": {
            "daily_study_hours": 4.0,
            "preferred_study_time": "morning",
            "break_duration_minutes": 15,
            "weekend_study": True,
            "saturday_available": True,
            "sunday_available": True,
            "notification_enabled": True,
            "exam_reminder_days": 7,
            "theme": "system",
        },
    }
    result = await db.users.insert_one(user_doc)
    user_doc["_id"] = result.inserted_id

    token = create_access_token({"sub": str(result.inserted_id)})
    return {"access_token": token, "token_type": "bearer", "user": _format_user(user_doc)}


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, body: UserLogin):
    db = get_db()
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token({"sub": str(user["_id"])})
    return {"access_token": token, "token_type": "bearer", "user": _format_user(user)}


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return _format_user(current_user)

from fastapi import APIRouter, Depends, HTTPException
from bson import ObjectId
from datetime import datetime, timezone
from config import get_db
from middleware.auth_middleware import get_current_user
from models.user import OnboardingData, ProfileUpdate, StudyPreferences

router = APIRouter()


@router.put("/onboarding")
async def complete_onboarding(body: OnboardingData, current_user: dict = Depends(get_current_user)):
    db = get_db()
    user_id = str(current_user["_id"])
    prefs = body.preferences.model_dump() if body.preferences else current_user.get("preferences", {})
    update = {
        "onboarding_complete": True,
        "college": body.college,
        "academic_year": body.academic_year,
        "board_university": body.board_university,
        "goals": body.goals,
        "existing_commitments": body.existing_commitments,
        "class_timings": [ct.model_dump() for ct in (body.class_timings or [])],
        "preferences": prefs,
        "updated_at": datetime.now(timezone.utc),
    }
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": update})
    return {"message": "Onboarding complete", "onboarding_complete": True}


@router.get("/profile")
async def get_profile(current_user: dict = Depends(get_current_user)):
    u = current_user
    return {
        "id": str(u["_id"]),
        "name": u["name"],
        "email": u["email"],
        "college": u.get("college"),
        "academic_year": u.get("academic_year"),
        "board_university": u.get("board_university"),
        "goals": u.get("goals"),
        "existing_commitments": u.get("existing_commitments"),
        "class_timings": u.get("class_timings", []),
        "onboarding_complete": u.get("onboarding_complete", False),
        "preferences": u.get("preferences", {}),
        "created_at": u.get("created_at"),
    }


@router.put("/profile")
async def update_profile(body: ProfileUpdate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.users.update_one({"_id": current_user["_id"]}, {"$set": update_data})
    updated_user = await db.users.find_one({"_id": current_user["_id"]})
    return {
        "message": "Profile updated",
        "name": updated_user.get("name"),
        "college": updated_user.get("college"),
        "academic_year": updated_user.get("academic_year"),
        "board_university": updated_user.get("board_university"),
        "goals": updated_user.get("goals"),
    }


@router.put("/preferences")
async def update_preferences(body: StudyPreferences, current_user: dict = Depends(get_current_user)):
    db = get_db()
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"preferences": body.model_dump(), "updated_at": datetime.now(timezone.utc)}}
    )
    return {"message": "Preferences updated", "preferences": body.model_dump()}


@router.delete("/account")
async def delete_account(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    # Delete all user data
    await db.users.delete_one({"_id": current_user["_id"]})
    await db.subjects.delete_many({"user_id": uid})
    await db.topics.delete_many({"user_id": uid})
    await db.sessions.delete_many({"user_id": uid})
    await db.planners.delete_many({"user_id": uid})
    await db.notifications.delete_many({"user_id": uid})
    return {"message": "Account deleted successfully"}

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from bson import ObjectId
from config import get_db
from middleware.auth_middleware import get_current_user
from services.notification_service import (
    get_user_notifications, mark_notification_read, mark_all_read
)

from utils.helpers import to_object_id

router = APIRouter()


class NotifPreferences(BaseModel):
    session_reminders: bool = True
    exam_alerts: bool = True
    missed_session_alerts: bool = True
    revision_reminders: bool = True
    daily_plan_ready: bool = True
    quiet_hours_start: str = "22:00"
    quiet_hours_end: str = "07:00"


@router.get("")
async def get_notifications(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    notifs = await get_user_notifications(db, uid)
    unread = sum(1 for n in notifs if not n.get("is_read"))
    return {"notifications": notifs, "unread_count": unread}


@router.put("/{notif_id}/read")
async def mark_read(notif_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    await mark_notification_read(db, notif_id, uid)
    return {"message": "Marked as read"}


@router.put("/mark-all-read")
async def mark_all(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    await mark_all_read(db, uid)
    return {"message": "All notifications marked as read"}


@router.put("/preferences")
async def update_notif_preferences(
    body: NotifPreferences,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"notification_preferences": body.model_dump()}}
    )
    return {"message": "Notification preferences updated", "preferences": body.model_dump()}


@router.delete("/{notif_id}")
async def delete_notification(notif_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    notif_oid = to_object_id(notif_id, "notification_id")
    await db.notifications.delete_one({"_id": notif_oid, "user_id": uid})
    return {"message": "Notification deleted"}

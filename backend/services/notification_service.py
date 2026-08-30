"""Notification service for creating and managing in-app notifications."""

from datetime import datetime, timezone
from typing import Optional


async def create_notification(
    db,
    user_id: str,
    notif_type: str,
    title: str,
    message: str,
    metadata: Optional[dict] = None,
):
    """Insert a notification into the DB."""
    doc = {
        "user_id": user_id,
        "type": notif_type,  # session_reminder/exam_alert/missed_session/revision_due/daily_plan
        "title": title,
        "message": message,
        "is_read": False,
        "metadata": metadata or {},
        "created_at": datetime.now(timezone.utc),
    }
    await db.notifications.insert_one(doc)


async def get_user_notifications(db, user_id: str, limit: int = 50) -> list:
    cursor = db.notifications.find(
        {"user_id": user_id}
    ).sort("created_at", -1).limit(limit)
    docs = await cursor.to_list(length=limit)
    result = []
    for d in docs:
        d["id"] = str(d["_id"])
        del d["_id"]
        result.append(d)
    return result


async def mark_notification_read(db, notification_id: str, user_id: str):
    from utils.helpers import to_object_id
    notif_oid = to_object_id(notification_id, "notification_id")
    await db.notifications.update_one(
        {"_id": notif_oid, "user_id": user_id},
        {"$set": {"is_read": True}}
    )


async def mark_all_read(db, user_id: str):
    await db.notifications.update_many(
        {"user_id": user_id, "is_read": False},
        {"$set": {"is_read": True}}
    )

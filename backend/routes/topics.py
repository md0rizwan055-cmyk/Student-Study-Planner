from fastapi import APIRouter, Depends, HTTPException, status, Query
from bson import ObjectId
from bson.errors import InvalidId
from datetime import datetime, timezone, timedelta
from typing import Optional
from config import get_db
from middleware.auth_middleware import get_current_user
from models.topic import TopicCreate, TopicUpdate, TopicProgressUpdate
from utils.helpers import compute_priority_score, calculate_days_to_exam, to_object_id
from services.revision_service import get_next_revision_date, adjust_interval_by_feedback

router = APIRouter()

_to_obj_id = to_object_id


def _format_topic(t: dict) -> dict:
    nrd = t.get("next_revision_date")
    ls = t.get("last_studied")
    ca = t.get("created_at")
    ua = t.get("updated_at")
    return {
        "id": str(t["_id"]),
        "subject_id": str(t.get("subject_id", "")),
        "user_id": str(t.get("user_id", "")),
        "name": t.get("name", ""),
        "difficulty": t.get("difficulty", 3),
        "importance": t.get("importance", 3),
        "estimated_hours": float(t.get("estimated_hours", 2.0)),
        "current_progress": float(t.get("current_progress", 0.0)),
        "status": t.get("status", "not_started"),
        "priority_score": float(t.get("priority_score", 0.5)),
        "last_studied": ls.isoformat() if isinstance(ls, datetime) else ls,
        "next_revision_date": nrd.isoformat() if isinstance(nrd, datetime) else nrd,
        "revision_count": int(t.get("revision_count", 0)),
        "notes": t.get("notes"),
        "order": t.get("order"),
        "created_at": ca.isoformat() if isinstance(ca, datetime) else ca,
        "updated_at": ua.isoformat() if isinstance(ua, datetime) else ua,
    }


@router.get("")
async def get_topics(
    subject_id: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    query = {"user_id": uid}
    if subject_id:
        query["subject_id"] = subject_id
    topics = await db.topics.find(query).sort([("priority_score", -1), ("order", 1)]).to_list(length=1000)
    return [_format_topic(t) for t in topics]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_topic(body: TopicCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])

    subject_oid = _to_obj_id(body.subject_id, "subject_id")
    subject = await db.subjects.find_one({"_id": subject_oid, "user_id": uid})
    if not subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subject not found")

    days_to_exam = calculate_days_to_exam(subject.get("exam_date"))
    score = compute_priority_score(body.difficulty, body.importance, body.current_progress, days_to_exam)
    status_val = "not_started" if body.current_progress == 0 else (
        "completed" if body.current_progress >= 100 else "in_progress"
    )

    now = datetime.now(timezone.utc)
    doc = {
        "user_id": uid,
        "subject_id": str(body.subject_id),
        "name": body.name.strip(),
        "difficulty": body.difficulty,
        "importance": body.importance,
        "estimated_hours": body.estimated_hours,
        "current_progress": body.current_progress,
        "status": status_val,
        "priority_score": score,
        "last_studied": None,
        "next_revision_date": None,
        "revision_count": 0,
        "notes": body.notes,
        "order": body.order,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.topics.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _format_topic(doc)


@router.put("/{topic_id}")
async def update_topic(
    topic_id: str,
    body: TopicUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    topic_oid = _to_obj_id(topic_id, "topic_id")
    topic = await db.topics.find_one({"_id": topic_oid, "user_id": uid})
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "name" in update_data and isinstance(update_data["name"], str):
        update_data["name"] = update_data["name"].strip()

    target_subject_id = update_data.get("subject_id", topic.get("subject_id"))
    subject_oid = _to_obj_id(str(target_subject_id), "subject_id")
    subject = await db.subjects.find_one({"_id": subject_oid, "user_id": uid})

    new_difficulty = update_data.get("difficulty", topic.get("difficulty", 3))
    new_importance = update_data.get("importance", topic.get("importance", 3))
    new_progress = update_data.get("current_progress", topic.get("current_progress", 0.0))

    days_to_exam = calculate_days_to_exam(subject.get("exam_date") if subject else None)
    update_data["priority_score"] = compute_priority_score(new_difficulty, new_importance, new_progress, days_to_exam)

    if "current_progress" in update_data:
        p = update_data["current_progress"]
        if p >= 100:
            update_data["status"] = "completed"
        elif p > 0 and topic.get("status") == "not_started":
            update_data["status"] = "in_progress"

    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.topics.update_one({"_id": topic_oid}, {"$set": update_data})
    updated = await db.topics.find_one({"_id": topic_oid})
    return _format_topic(updated)


@router.put("/{topic_id}/progress")
async def update_topic_progress(
    topic_id: str,
    body: TopicProgressUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    topic_oid = _to_obj_id(topic_id, "topic_id")
    topic = await db.topics.find_one({"_id": topic_oid, "user_id": uid})
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")

    now = datetime.now(timezone.utc)
    revision_count = int(topic.get("revision_count", 0))

    if body.feedback:
        interval_days = adjust_interval_by_feedback(revision_count, body.feedback)
        next_rev_date = now.date() + timedelta(days=interval_days)
    else:
        next_rev_date = get_next_revision_date(revision_count, now.date())

    status_val = "completed" if body.progress >= 100 else ("in_progress" if body.progress > 0 else "not_started")
    if body.progress >= 100:
        revision_count += 1
        status_val = "completed"

    next_rev_dt = None
    if next_rev_date:
        next_rev_dt = datetime.combine(next_rev_date, datetime.min.time()).replace(tzinfo=timezone.utc)

    update = {
        "current_progress": body.progress,
        "status": status_val,
        "last_studied": now,
        "next_revision_date": next_rev_dt,
        "revision_count": revision_count,
        "updated_at": now,
    }

    if body.feedback == "hard":
        update["difficulty"] = min(5, int(topic.get("difficulty", 3)) + 1)
        update["status"] = "needs_revision"

    await db.topics.update_one({"_id": topic_oid}, {"$set": update})
    updated = await db.topics.find_one({"_id": topic_oid})
    return _format_topic(updated)


@router.delete("/{topic_id}")
async def delete_topic(topic_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    topic_oid = _to_obj_id(topic_id, "topic_id")
    topic = await db.topics.find_one({"_id": topic_oid, "user_id": uid})
    if not topic:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topic not found")
    await db.topics.delete_one({"_id": topic_oid})
    return {"message": "Topic deleted"}

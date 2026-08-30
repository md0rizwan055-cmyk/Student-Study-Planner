from fastapi import APIRouter, Depends, HTTPException, status
from bson import ObjectId
from datetime import datetime, timezone, date
from config import get_db
from middleware.auth_middleware import get_current_user
from models.subject import SubjectCreate, SubjectUpdate
from utils.helpers import calculate_days_to_exam, to_object_id

router = APIRouter()


def _format_subject(s: dict, topic_stats: dict | None = None) -> dict:
    ts = topic_stats or {}
    exam_date = s.get("exam_date")
    if isinstance(exam_date, datetime):
        exam_date = exam_date.date()
    return {
        "id": str(s["_id"]),
        "user_id": s["user_id"],
        "name": s["name"],
        "color": s.get("color", "#7C3AED"),
        "exam_date": exam_date.isoformat() if exam_date else None,
        "total_marks": s.get("total_marks"),
        "target_marks": s.get("target_marks"),
        "notes": s.get("notes"),
        "total_topics": ts.get("total", 0),
        "completed_topics": ts.get("completed", 0),
        "progress_percent": ts.get("progress", 0.0),
        "days_to_exam": calculate_days_to_exam(exam_date),
        "created_at": s.get("created_at"),
        "updated_at": s.get("updated_at"),
    }


async def _get_topic_stats(db, user_id: str, subject_id: str) -> dict:
    topics = await db.topics.find(
        {"user_id": user_id, "subject_id": subject_id}
    ).to_list(length=1000)
    total = len(topics)
    completed = sum(1 for t in topics if t.get("status") == "completed")
    progress = (completed / total * 100) if total > 0 else 0.0
    return {"total": total, "completed": completed, "progress": round(progress, 1)}


@router.get("")
async def get_subjects(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    subjects = await db.subjects.find({"user_id": uid}).sort("created_at", 1).to_list(length=200)
    result = []
    for s in subjects:
        stats = await _get_topic_stats(db, uid, str(s["_id"]))
        result.append(_format_subject(s, stats))
    return result


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_subject(body: SubjectCreate, current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    now = datetime.now(timezone.utc)
    exam_dt = None
    if body.exam_date:
        exam_dt = datetime.combine(body.exam_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    doc = {
        "user_id": uid,
        "name": body.name.strip(),
        "color": body.color,
        "exam_date": exam_dt,
        "total_marks": body.total_marks,
        "target_marks": body.target_marks,
        "notes": body.notes,
        "created_at": now,
        "updated_at": now,
    }
    result = await db.subjects.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _format_subject(doc, {"total": 0, "completed": 0, "progress": 0.0})


@router.put("/{subject_id}")
async def update_subject(
    subject_id: str,
    body: SubjectUpdate,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    subject_oid = to_object_id(subject_id, "subject_id")
    subject = await db.subjects.find_one({"_id": subject_oid, "user_id": uid})
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "exam_date" in update_data and update_data["exam_date"]:
        update_data["exam_date"] = datetime.combine(
            update_data["exam_date"], datetime.min.time()
        ).replace(tzinfo=timezone.utc)
    update_data["updated_at"] = datetime.now(timezone.utc)
    await db.subjects.update_one({"_id": subject_oid}, {"$set": update_data})

    updated = await db.subjects.find_one({"_id": subject_oid})
    stats = await _get_topic_stats(db, uid, str(subject_oid))
    return _format_subject(updated, stats)


@router.delete("/{subject_id}")
async def delete_subject(subject_id: str, current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    subject_oid = to_object_id(subject_id, "subject_id")
    subject = await db.subjects.find_one({"_id": subject_oid, "user_id": uid})
    if not subject:
        raise HTTPException(status_code=404, detail="Subject not found")
    await db.subjects.delete_one({"_id": subject_oid})
    await db.topics.delete_many({"subject_id": str(subject_oid), "user_id": uid})
    return {"message": "Subject and its topics deleted"}

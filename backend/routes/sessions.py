from fastapi import APIRouter, Depends, HTTPException, Query
from bson import ObjectId
from datetime import datetime, timezone, date, timedelta
from config import get_db
from middleware.auth_middleware import get_current_user
from models.session import SessionFeedback, SessionReschedule
from services.notification_service import create_notification
from services.revision_service import adjust_interval_by_feedback
from utils.helpers import to_object_id, time_str_to_minutes, minutes_to_time_str

router = APIRouter()


def _fmt(s: dict) -> dict:
    return {
        "id": str(s["_id"]),
        "user_id": s["user_id"],
        "subject_id": s.get("subject_id"),
        "topic_id": s.get("topic_id"),
        "subject_name": s.get("subject_name", ""),
        "topic_name": s.get("topic_name", ""),
        "subject_color": s.get("subject_color", "#7C3AED"),
        "session_type": s.get("session_type", "learning"),
        "date": s.get("date"),
        "start_time": s.get("start_time"),
        "end_time": s.get("end_time"),
        "duration_minutes": s.get("duration_minutes", 45),
        "status": s.get("status", "scheduled"),
        "feedback": s.get("feedback"),
        "notes": s.get("notes"),
        "is_ai_generated": s.get("is_ai_generated", True),
        "created_at": s.get("created_at"),
        "updated_at": s.get("updated_at"),
    }


@router.get("")
async def get_sessions(
    date_str: str = Query(None, alias="date"),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    query = {"user_id": uid}
    if date_str:
        query["date"] = date_str
    sessions = await db.sessions.find(query).sort([("date", 1), ("start_time", 1)]).to_list(length=500)
    return [_fmt(s) for s in sessions]


@router.put("/{session_id}/complete")
async def complete_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    session_oid = to_object_id(session_id, "session_id")
    session = await db.sessions.find_one({"_id": session_oid, "user_id": uid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = datetime.now(timezone.utc)
    await db.sessions.update_one(
        {"_id": session_oid},
        {"$set": {"status": "completed", "completed_at": now, "updated_at": now}}
    )

    # Update topic progress
    topic_id = session.get("topic_id")
    if topic_id:
        topic_oid = to_object_id(str(topic_id), "topic_id")
        topic = await db.topics.find_one({"_id": topic_oid, "user_id": uid})
        if topic:
            old_progress = topic.get("current_progress", 0)
            # Each completed session = +15-25% progress increment
            increment = max(10, min(25, 100 / max(1, topic.get("estimated_hours", 2) * 2)))
            new_progress = min(100, old_progress + increment)
            status_val = "completed" if new_progress >= 100 else "in_progress"
            await db.topics.update_one(
                {"_id": topic_oid},
                {"$set": {
                    "current_progress": new_progress,
                    "status": status_val,
                    "last_studied": now,
                    "updated_at": now,
                }}
            )

    return {"message": "Session completed", "id": session_id}


@router.put("/{session_id}/skip")
async def skip_session(
    session_id: str,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    session_oid = to_object_id(session_id, "session_id")
    session = await db.sessions.find_one({"_id": session_oid, "user_id": uid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = datetime.now(timezone.utc)
    await db.sessions.update_one(
        {"_id": session_oid},
        {"$set": {"status": "skipped", "updated_at": now}}
    )
    return {"message": "Session skipped", "id": session_id}


@router.put("/{session_id}/reschedule")
async def reschedule_session(
    session_id: str,
    body: SessionReschedule,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    session_oid = to_object_id(session_id, "session_id")
    session = await db.sessions.find_one({"_id": session_oid, "user_id": uid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Calculate new end time
    dur = session.get("duration_minutes", 45)
    start_min = time_str_to_minutes(body.new_start_time)
    end_min = start_min + dur

    now = datetime.now(timezone.utc)
    await db.sessions.update_one(
        {"_id": session_oid},
        {"$set": {
            "date": body.new_date.isoformat(),
            "start_time": body.new_start_time,
            "end_time": minutes_to_time_str(end_min),
            "status": "scheduled",
            "rescheduled": True,
            "updated_at": now,
        }}
    )
    return {"message": "Session rescheduled", "new_date": body.new_date.isoformat()}


@router.post("/{session_id}/feedback")
async def submit_feedback(
    session_id: str,
    body: SessionFeedback,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    session_oid = to_object_id(session_id, "session_id")
    session = await db.sessions.find_one({"_id": session_oid, "user_id": uid})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    now = datetime.now(timezone.utc)
    feedback_doc = {
        "rating": body.rating,
        "notes": body.notes,
        "actual_duration_minutes": body.actual_duration_minutes,
        "submitted_at": now,
    }
    await db.sessions.update_one(
        {"_id": session_oid},
        {"$set": {"feedback": feedback_doc, "status": "completed", "updated_at": now}}
    )

    # Adjust topic difficulty weight based on feedback
    topic_id = session.get("topic_id")
    if topic_id and body.rating == "hard":
        topic_oid = to_object_id(str(topic_id), "topic_id")
        topic = await db.topics.find_one({"_id": topic_oid, "user_id": uid})
        if topic:
            new_difficulty = min(5, topic.get("difficulty", 3) + 1)
            await db.topics.update_one(
                {"_id": topic_oid},
                {"$set": {"difficulty": new_difficulty, "status": "needs_revision", "updated_at": now}}
            )

    return {"message": "Feedback submitted", "feedback": feedback_doc}


@router.post("/redistribute-missed")
async def redistribute_missed(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    today = date.today().isoformat()

    # Find missed sessions (past date, still 'scheduled')
    missed = await db.sessions.find(
        {"user_id": uid, "date": {"$lt": today}, "status": "scheduled"}
    ).to_list(length=500)

    if not missed:
        return {"message": "No missed sessions found", "redistributed": 0}

    # Mark them as missed
    missed_ids = [s["_id"] for s in missed]
    await db.sessions.update_many(
        {"_id": {"$in": missed_ids}},
        {"$set": {"status": "missed", "updated_at": datetime.now(timezone.utc)}}
    )

    # Get future plan for redistribution context
    future_sessions = await db.sessions.find(
        {"user_id": uid, "date": {"$gte": today}, "status": "scheduled"}
    ).to_list(length=2000)

    from services.planner_engine import redistribute_missed_sessions
    prefs = current_user.get("preferences", {})
    existing_plan = []
    dates_seen = set()
    for s in future_sessions:
        d = s.get("date", "")
        if d not in dates_seen:
            dates_seen.add(d)
            day_sessions = [x for x in future_sessions if x.get("date") == d]
            existing_plan.append({
                "date": d,
                "total_hours": sum(x.get("duration_minutes", 45) for x in day_sessions) / 60,
            })

    missed_dicts = [{**s, "id": str(s["_id"])} for s in missed]
    rescheduled = redistribute_missed_sessions(missed_dicts, existing_plan, current_user, date.today())

    # Insert rescheduled sessions
    now_utc = datetime.now(timezone.utc)
    new_sessions = []
    for rs in rescheduled:
        if rs.get("status") == "scheduled":
            doc = {
                "user_id": uid,
                "subject_id": rs.get("subject_id"),
                "topic_id": rs.get("topic_id"),
                "subject_name": rs.get("subject_name", ""),
                "topic_name": rs.get("topic_name", ""),
                "subject_color": rs.get("subject_color", "#7C3AED"),
                "session_type": rs.get("session_type", "learning"),
                "date": rs["date"],
                "start_time": rs.get("start_time", "09:00"),
                "end_time": rs.get("end_time", "09:45"),
                "duration_minutes": rs.get("duration_minutes", 45),
                "status": "scheduled",
                "is_ai_generated": True,
                "rescheduled_from": rs.get("rescheduled_from"),
                "feedback": None,
                "notes": "Rescheduled from missed session",
                "created_at": now_utc,
                "updated_at": now_utc,
            }
            new_sessions.append(doc)

    if new_sessions:
        await db.sessions.insert_many(new_sessions)

    await create_notification(
        db, uid, "missed_session",
        "🔄 Missed Sessions Rescheduled",
        f"{len(missed)} missed sessions have been redistributed into your upcoming schedule."
    )

    return {
        "message": f"{len(missed)} missed sessions redistributed",
        "redistributed": len(new_sessions),
        "missed_count": len(missed),
    }

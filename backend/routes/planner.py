from fastapi import APIRouter, Depends, HTTPException, Query
from bson import ObjectId
from datetime import datetime, timezone, date, timedelta
from config import get_db
from middleware.auth_middleware import get_current_user
from services.planner_engine import generate_timetable, redistribute_missed_sessions
from services.notification_service import create_notification

router = APIRouter()


@router.post("/generate")
async def generate_plan(
    regenerate: bool = False,
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])

    # Fetch subjects and topics
    subjects = await db.subjects.find({"user_id": uid}).to_list(length=200)
    topics = await db.topics.find({"user_id": uid}).to_list(length=2000)

    if not subjects:
        raise HTTPException(status_code=400, detail="Add at least one subject before generating a plan")
    if not topics:
        raise HTTPException(status_code=400, detail="Add topics to your subjects before generating a plan")

    if regenerate:
        # Remove existing future sessions
        today_str = date.today().isoformat()
        await db.sessions.delete_many({"user_id": uid, "date": {"$gte": today_str}, "status": "scheduled"})

    # Generate the timetable
    plan = generate_timetable(subjects, topics, current_user, start_date=date.today())

    # Save sessions to DB
    sessions_to_insert = []
    now = datetime.now(timezone.utc)
    for day_plan in plan["daily_plans"]:
        for sess in day_plan.get("sessions", []):
            sess_doc = {
                "user_id": uid,
                "subject_id": sess["subject_id"],
                "topic_id": sess["topic_id"],
                "subject_name": sess["subject_name"],
                "topic_name": sess["topic_name"],
                "subject_color": sess.get("subject_color", "#7C3AED"),
                "session_type": sess["session_type"],
                "date": sess["date"],
                "start_time": sess["start_time"],
                "end_time": sess["end_time"],
                "duration_minutes": sess["duration_minutes"],
                "status": "scheduled",
                "is_ai_generated": True,
                "feedback": None,
                "notes": None,
                "created_at": now,
                "updated_at": now,
            }
            sessions_to_insert.append(sess_doc)

    if sessions_to_insert:
        await db.sessions.insert_many(sessions_to_insert)

    # Save planner document
    planner_doc = {
        "user_id": uid,
        "generated_at": now,
        "start_date": plan["start_date"],
        "end_date": plan["end_date"],
        "recommended_daily_hours": plan["recommended_daily_hours"],
        "overloaded": plan["overloaded"],
        "overload_message": plan.get("overload_message"),
        "topic_categories": plan["topic_categories"],
        "total_sessions": plan["total_sessions"],
        "total_study_hours": plan["total_study_hours"],
        "ai_explanation": plan.get("ai_explanation"),
    }
    await db.planners.replace_one({"user_id": uid}, planner_doc, upsert=True)

    # Create notification
    await create_notification(
        db, uid, "daily_plan",
        "📅 Study Plan Generated!",
        f"Your personalized {plan['total_sessions']}-session plan is ready. "
        f"Recommended: {plan['recommended_daily_hours']}h/day."
    )

    return {**plan, "sessions_saved": len(sessions_to_insert)}


@router.get("/timetable")
async def get_timetable(
    date_str: str = Query(None, alias="date"),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    target_date = date_str or date.today().isoformat()

    sessions = await db.sessions.find(
        {"user_id": uid, "date": target_date}
    ).sort("start_time", 1).to_list(length=200)

    return {
        "date": target_date,
        "sessions": [_format_session(s) for s in sessions],
        "total_sessions": len(sessions),
        "total_hours": round(sum(s.get("duration_minutes", 0) for s in sessions) / 60, 2),
    }


@router.get("/weekly")
async def get_weekly(
    week_start: str = Query(None),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    if week_start:
        start = date.fromisoformat(week_start)
    else:
        today = date.today()
        start = today - timedelta(days=today.weekday())

    end = start + timedelta(days=6)
    sessions = await db.sessions.find(
        {"user_id": uid, "date": {"$gte": start.isoformat(), "$lte": end.isoformat()}}
    ).sort([("date", 1), ("start_time", 1)]).to_list(length=1000)

    days = []
    for i in range(7):
        d = start + timedelta(days=i)
        d_str = d.isoformat()
        day_sessions = [_format_session(s) for s in sessions if s.get("date") == d_str]
        days.append({
            "date": d_str,
            "day_name": d.strftime("%A"),
            "sessions": day_sessions,
            "total_hours": round(sum(s.get("duration_minutes", 45) for s in day_sessions) / 60, 2),
        })

    return {
        "week_start": start.isoformat(),
        "week_end": end.isoformat(),
        "days": days,
        "total_sessions": len(sessions),
        "total_hours": round(sum(s.get("duration_minutes", 0) for s in sessions) / 60, 2),
    }


@router.get("/exam-prep")
async def get_exam_prep(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    subjects = await db.subjects.find({"user_id": uid}).to_list(length=200)
    today = date.today()
    upcoming = []
    for s in subjects:
        ed = s.get("exam_date")
        if ed:
            if isinstance(ed, datetime):
                ed = ed.date()
            days_left = (ed - today).days
            if 0 <= days_left <= 60:
                topics = await db.topics.find(
                    {"user_id": uid, "subject_id": str(s["_id"])}
                ).to_list(length=200)
                total = len(topics)
                completed = sum(1 for t in topics if t.get("status") == "completed")
                upcoming.append({
                    "subject_id": str(s["_id"]),
                    "subject_name": s["name"],
                    "subject_color": s.get("color", "#7C3AED"),
                    "exam_date": ed.isoformat(),
                    "days_left": days_left,
                    "total_topics": total,
                    "completed_topics": completed,
                    "readiness_percent": round(completed / total * 100, 1) if total > 0 else 0,
                })
    upcoming.sort(key=lambda x: x["days_left"])
    return {"upcoming_exams": upcoming}


@router.get("/status")
async def get_plan_status(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    planner = await db.planners.find_one({"user_id": uid})
    if not planner:
        return {"has_plan": False}
    return {
        "has_plan": True,
        "generated_at": planner.get("generated_at"),
        "recommended_daily_hours": planner.get("recommended_daily_hours"),
        "total_sessions": planner.get("total_sessions"),
        "overloaded": planner.get("overloaded", False),
        "ai_explanation": planner.get("ai_explanation"),
        "topic_categories": planner.get("topic_categories", []),
    }


def _format_session(s: dict) -> dict:
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

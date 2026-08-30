from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from config import get_db
from middleware.auth_middleware import get_current_user
from services.ai_service import chat_with_ai, get_ai_recommendations
from utils.helpers import calculate_days_to_exam
from datetime import datetime, date

router = APIRouter()


class ChatMessage(BaseModel):
    message: str
    conversation_id: str = "default"


@router.post("/chat")
async def ai_chat(body: ChatMessage, current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])

    # Build student context
    subjects = await db.subjects.find({"user_id": uid}).to_list(length=50)
    topics = await db.topics.find({"user_id": uid}).to_list(length=500)
    today = date.today().isoformat()
    sessions_today = await db.sessions.find(
        {"user_id": uid, "date": today}
    ).to_list(length=50)

    # Format for AI
    fmt_subjects = []
    for s in subjects:
        ed = s.get("exam_date")
        if isinstance(ed, datetime):
            ed = ed.date()
        fmt_subjects.append({
            "name": s.get("name"),
            "progress_percent": 0.0,
            "exam_date": ed.isoformat() if ed else None,
            "days_to_exam": calculate_days_to_exam(ed),
        })

    context = {
        "name": current_user.get("name", "Student"),
        "subjects": fmt_subjects,
        "topics": [{"name": t.get("name"), "status": t.get("status"), "subject_id": t.get("subject_id")} for t in topics[:50]],
        "sessions_today": [{"topic_name": s.get("topic_name"), "subject_name": s.get("subject_name"), "session_type": s.get("session_type"), "duration_minutes": s.get("duration_minutes")} for s in sessions_today],
        "preferences": current_user.get("preferences", {}),
        "upcoming_exams": [s for s in fmt_subjects if s.get("days_to_exam") is not None and s["days_to_exam"] <= 30],
    }

    response = await chat_with_ai(body.message, context)
    return {"response": response, "conversation_id": body.conversation_id}


@router.get("/recommendations")
async def get_recommendations(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    today = date.today().isoformat()

    subjects = await db.subjects.find({"user_id": uid}).to_list(length=50)
    topics = await db.topics.find({"user_id": uid}).to_list(length=500)
    sessions_today = await db.sessions.find({"user_id": uid, "date": today}).to_list(length=50)

    fmt_subjects = []
    for s in subjects:
        ed = s.get("exam_date")
        if isinstance(ed, datetime):
            ed = ed.date()
        t_list = [t for t in topics if t.get("subject_id") == str(s["_id"])]
        total = len(t_list)
        done = sum(1 for t in t_list if t.get("status") == "completed")
        fmt_subjects.append({
            "name": s.get("name"),
            "progress_percent": round(done / total * 100, 1) if total > 0 else 0.0,
            "exam_date": ed.isoformat() if ed else None,
            "days_to_exam": calculate_days_to_exam(ed),
        })

    context = {
        "name": current_user.get("name", "Student"),
        "subjects": fmt_subjects,
        "topics": [{"name": t.get("name"), "status": t.get("status")} for t in topics[:100]],
        "sessions_today": [{"topic_name": s.get("topic_name"), "subject_name": s.get("subject_name"), "session_type": s.get("session_type"), "duration_minutes": s.get("duration_minutes")} for s in sessions_today],
        "preferences": current_user.get("preferences", {}),
        "upcoming_exams": [s for s in fmt_subjects if s.get("days_to_exam") is not None and s["days_to_exam"] <= 30],
    }

    return await get_ai_recommendations(context)


@router.get("/topic-priorities")
async def get_topic_priorities(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    planner = await db.planners.find_one({"user_id": uid})
    if not planner:
        return {"topic_categories": [], "message": "Generate your AI plan first"}
    return {"topic_categories": planner.get("topic_categories", [])}

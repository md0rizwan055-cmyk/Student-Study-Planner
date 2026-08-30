from fastapi import APIRouter, Depends, Query
from bson import ObjectId
from datetime import datetime, timezone, date, timedelta
from config import get_db
from middleware.auth_middleware import get_current_user
from utils.helpers import calculate_days_to_exam

router = APIRouter()


@router.get("/overview")
async def get_overview(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    topics = await db.topics.find({"user_id": uid}).to_list(length=2000)
    sessions = await db.sessions.find({"user_id": uid}).to_list(length=5000)
    today = date.today().isoformat()

    total_topics = len(topics)
    completed_topics = sum(1 for t in topics if t.get("status") == "completed")
    in_progress = sum(1 for t in topics if t.get("status") == "in_progress")
    overall_pct = round(completed_topics / total_topics * 100, 1) if total_topics > 0 else 0.0

    completed_sessions = [s for s in sessions if s.get("status") == "completed"]
    missed_sessions = [s for s in sessions if s.get("status") == "missed"]
    skipped_sessions = [s for s in sessions if s.get("status") == "skipped"]

    total_hours = sum(s.get("duration_minutes", 0) for s in completed_sessions) / 60
    revision_due = sum(1 for t in topics if t.get("status") == "needs_revision")
    revisions_done = sum(1 for t in topics if t.get("revision_count", 0) > 0)

    streak = _calculate_streak(sessions)

    return {
        "total_topics": total_topics,
        "completed_topics": completed_topics,
        "in_progress_topics": in_progress,
        "overall_percent": overall_pct,
        "total_study_hours": round(total_hours, 1),
        "sessions_completed": len(completed_sessions),
        "sessions_missed": len(missed_sessions),
        "sessions_skipped": len(skipped_sessions),
        "current_streak": streak["current"],
        "longest_streak": streak["longest"],
        "revisions_completed": revisions_done,
        "revisions_pending": revision_due,
    }


@router.get("/subjects")
async def get_subject_progress(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    subjects = await db.subjects.find({"user_id": uid}).to_list(length=200)
    result = []
    for s in subjects:
        sid = str(s["_id"])
        topics = await db.topics.find({"user_id": uid, "subject_id": sid}).to_list(length=500)
        sessions = await db.sessions.find(
            {"user_id": uid, "subject_id": sid, "status": "completed"}
        ).to_list(length=1000)

        total = len(topics)
        completed = sum(1 for t in topics if t.get("status") == "completed")
        pct = round(completed / total * 100, 1) if total > 0 else 0.0
        study_hours = sum(s.get("duration_minutes", 0) for s in sessions) / 60

        exam_date = s.get("exam_date")
        if isinstance(exam_date, datetime):
            exam_date = exam_date.date()
        days_to_exam = calculate_days_to_exam(exam_date)

        # Simple readiness score
        readiness = pct * 0.7 + min(100, study_hours * 5) * 0.3
        result.append({
            "subject_id": sid,
            "subject_name": s["name"],
            "subject_color": s.get("color", "#7C3AED"),
            "total_topics": total,
            "completed_topics": completed,
            "progress_percent": pct,
            "study_hours": round(study_hours, 1),
            "exam_date": exam_date.isoformat() if exam_date else None,
            "days_to_exam": days_to_exam,
            "readiness_score": round(min(100, readiness), 1),
        })
    return result


@router.get("/weekly-hours")
async def get_weekly_hours(
    weeks: int = Query(default=8, ge=1, le=52),
    current_user: dict = Depends(get_current_user)
):
    db = get_db()
    uid = str(current_user["_id"])
    today = date.today()
    result = []

    for w in range(weeks - 1, -1, -1):
        week_start = today - timedelta(days=today.weekday()) - timedelta(weeks=w)
        week_end = week_start + timedelta(days=6)
        sessions = await db.sessions.find({
            "user_id": uid,
            "date": {"$gte": week_start.isoformat(), "$lte": week_end.isoformat()},
        }).to_list(length=500)

        planned = sum(s.get("duration_minutes", 0) for s in sessions if s["status"] in ("scheduled", "completed")) / 60
        actual = sum(s.get("duration_minutes", 0) for s in sessions if s["status"] == "completed") / 60

        days = []
        for i in range(7):
            d = week_start + timedelta(days=i)
            d_str = d.isoformat()
            day_sessions = [s for s in sessions if s.get("date") == d_str and s["status"] == "completed"]
            days.append({
                "date": d_str,
                "day": d.strftime("%a"),
                "hours": round(sum(s.get("duration_minutes", 0) for s in day_sessions) / 60, 2),
                "sessions": len(day_sessions),
            })

        result.append({
            "week_label": week_start.strftime("Week of %b %d"),
            "week_start": week_start.isoformat(),
            "planned_hours": round(planned, 1),
            "actual_hours": round(actual, 1),
            "days": days,
        })
    return result


@router.get("/streaks")
async def get_streaks(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    sessions = await db.sessions.find(
        {"user_id": uid, "status": "completed"}
    ).sort("date", -1).to_list(length=5000)

    streak = _calculate_streak(sessions)
    # Build 90-day heatmap
    today = date.today()
    heatmap = []
    dates_with_study = {}
    for s in sessions:
        d = s.get("date", "")
        if d not in dates_with_study:
            dates_with_study[d] = 0
        dates_with_study[d] += s.get("duration_minutes", 0) / 60

    for i in range(89, -1, -1):
        d = today - timedelta(days=i)
        d_str = d.isoformat()
        heatmap.append({
            "date": d_str,
            "studied": d_str in dates_with_study,
            "hours": round(dates_with_study.get(d_str, 0.0), 2),
        })

    return {
        "current_streak": streak["current"],
        "longest_streak": streak["longest"],
        "total_study_days": len(dates_with_study),
        "heatmap": heatmap,
    }


@router.get("/analytics")
async def get_full_analytics(current_user: dict = Depends(get_current_user)):
    db = get_db()
    uid = str(current_user["_id"])
    topics = await db.topics.find({"user_id": uid}).to_list(length=2000)

    # Completion trend — last 30 days
    today = date.today()
    trend = []
    for i in range(29, -1, -1):
        d = today - timedelta(days=i)
        completed_by_day = sum(
            1 for t in topics
            if t.get("last_studied") and
            (t["last_studied"].date() if isinstance(t["last_studied"], datetime) else date.fromisoformat(str(t["last_studied"])[:10])) <= d
            and t.get("status") == "completed"
        )
        trend.append({"date": d.isoformat(), "completed_topics": completed_by_day})

    return {"completion_trend": trend}


def _calculate_streak(sessions: list) -> dict:
    completed_dates = sorted(set(
        s.get("date", "") for s in sessions if s.get("status") == "completed" and s.get("date")
    ), reverse=True)

    if not completed_dates:
        return {"current": 0, "longest": 0}

    today = date.today()
    yesterday = today - timedelta(days=1)
    
    # Check if the streak is still active (studied today or yesterday)
    latest_study_str = completed_dates[0]
    if latest_study_str != today.isoformat() and latest_study_str != yesterday.isoformat():
        current = 0
    else:
        # Calculate current active streak
        current = 0
        check_date = date.fromisoformat(latest_study_str)
        for cd in completed_dates:
            if cd == check_date.isoformat():
                current += 1
                check_date -= timedelta(days=1)
            else:
                break

    # Longest streak
    longest = 0
    run = 0
    prev_date = None
    for cd in sorted(completed_dates):
        d_obj = date.fromisoformat(cd)
        if prev_date and (d_obj - prev_date).days == 1:
            run += 1
        else:
            run = 1
        longest = max(longest, run)
        prev_date = d_obj

    return {"current": current, "longest": longest}

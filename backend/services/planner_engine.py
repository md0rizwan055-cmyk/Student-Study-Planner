"""
AI-Powered Planning Engine
Generates personalized study timetables based on:
- Subjects, topics, difficulty, importance, progress
- Exam dates and urgency
- Student's daily availability, class timings, preferences
- Spaced repetition for revisions
"""

from datetime import date, timedelta, datetime
from typing import List, Dict, Optional, Tuple
from utils.helpers import (
    compute_priority_score, categorize_topic,
    time_str_to_minutes, minutes_to_time_str, get_day_name,
    calculate_days_to_exam
)
import random


SESSION_TYPES = {
    "learning": {"label": "Learning", "color_mod": 1.0, "min_minutes": 45, "max_minutes": 90},
    "practice": {"label": "Practice", "color_mod": 0.85, "min_minutes": 30, "max_minutes": 60},
    "revision": {"label": "Revision", "color_mod": 0.7, "min_minutes": 30, "max_minutes": 45},
    "mock_test": {"label": "Mock Test", "color_mod": 0.6, "min_minutes": 60, "max_minutes": 120},
    "assignment": {"label": "Assignment", "color_mod": 0.75, "min_minutes": 45, "max_minutes": 90},
    "buffer": {"label": "Buffer / Catch-up", "color_mod": 0.5, "min_minutes": 30, "max_minutes": 60},
}

PREFERRED_START_TIMES = {
    "morning": "06:00",
    "afternoon": "12:00",
    "evening": "17:00",
    "night": "20:00",
}


def generate_timetable(
    subjects: List[dict],
    topics: List[dict],
    student_profile: dict,
    start_date: Optional[date] = None,
) -> dict:
    """
    Main timetable generation function.
    Returns a structured plan with daily sessions.
    """
    if not start_date:
        start_date = date.today()

    prefs = student_profile.get("preferences", {})
    daily_hours = prefs.get("daily_study_hours", 4.0)
    preferred_time = prefs.get("preferred_study_time", "morning")
    break_duration = prefs.get("break_duration_minutes", 15)
    weekend_study = prefs.get("weekend_study", True)
    saturday = prefs.get("saturday_available", True)
    sunday = prefs.get("sunday_available", True)
    class_timings = student_profile.get("class_timings", [])

    # Determine planning end date (latest exam date + buffer, or 90 days)
    end_date = _get_planning_end_date(subjects, start_date)

    # Score and sort topics
    enriched_topics = _enrich_topics(topics, subjects, start_date)
    enriched_topics.sort(key=lambda t: t["priority_score"], reverse=True)

    # Determine if overloaded
    total_remaining_hours = sum(
        t["estimated_hours"] * (1 - t["current_progress"] / 100)
        for t in enriched_topics
    )
    available_days = _count_available_days(start_date, end_date, weekend_study, saturday, sunday)
    total_available_hours = available_days * daily_hours
    overloaded = total_remaining_hours > total_available_hours * 1.1

    # Categorize topics
    for t in enriched_topics:
        t["category"] = categorize_topic(
            t["priority_score"], t.get("days_to_exam"), t["current_progress"]
        )

    topic_categories = [
        {
            "topic_id": str(t["_id"]),
            "topic_name": t["name"],
            "subject_name": t.get("subject_name", ""),
            "priority_score": t["priority_score"],
            "category": t["category"],
            "reasoning": _generate_reasoning(t),
        }
        for t in enriched_topics
    ]

    # Generate day-by-day schedule
    daily_plans = []
    topic_queue = [t for t in enriched_topics if t["category"] in ("must_study", "should_study")]
    if not overloaded:
        topic_queue = enriched_topics  # include all

    topic_hours_remaining = {
        str(t["_id"]): max(0, t["estimated_hours"] * (1 - t["current_progress"] / 100))
        for t in topic_queue
    }

    session_counter = 0
    total_study_hours = 0.0
    current_date = start_date

    # Track revision schedule (spaced repetition)
    revision_schedule: Dict[str, List[date]] = {}  # topic_id -> [revision dates]

    while current_date <= end_date:
        day_name = get_day_name(current_date)

        # Check availability
        if not _is_day_available(current_date, weekend_study, saturday, sunday):
            daily_plans.append({
                "date": current_date.isoformat(),
                "day_name": current_date.strftime("%A"),
                "sessions": [],
                "total_hours": 0.0,
                "is_available": False,
                "note": "Rest day — enjoy your break! 🌟",
            })
            current_date += timedelta(days=1)
            continue

        # Build blocked slots from class timings
        blocked_slots = _get_blocked_slots(class_timings, day_name)

        # Get available time slots
        study_start = time_str_to_minutes(PREFERRED_START_TIMES.get(preferred_time, "09:00"))
        study_end = min(study_start + int(daily_hours * 60), time_str_to_minutes("23:00"))

        sessions = []
        current_time = study_start
        day_hours = 0.0
        session_block = 0  # sessions before break

        # Schedule revisions due today
        revision_sessions = _get_revision_sessions(
            revision_schedule, current_date, enriched_topics, topics
        )
        for rev in revision_sessions:
            if current_time + 35 > study_end:
                break
            end_time = current_time + 35
            if _conflicts_with_blocked(current_time, end_time, blocked_slots):
                current_time = _next_free_slot(current_time, end_time, blocked_slots)
            if current_time + 35 <= study_end:
                sessions.append({
                    "id": f"sess_{current_date.isoformat()}_{session_counter}",
                    "subject_id": rev["subject_id"],
                    "topic_id": rev["topic_id"],
                    "subject_name": rev["subject_name"],
                    "topic_name": rev["topic_name"],
                    "subject_color": rev["subject_color"],
                    "session_type": "revision",
                    "date": current_date.isoformat(),
                    "start_time": minutes_to_time_str(current_time),
                    "end_time": minutes_to_time_str(current_time + 35),
                    "duration_minutes": 35,
                    "status": "scheduled",
                    "is_ai_generated": True,
                })
                current_time += 35 + break_duration
                session_counter += 1
                day_hours += 35 / 60

        # Schedule learning/practice sessions
        for t in topic_queue:
            tid = str(t["_id"])
            remaining = topic_hours_remaining.get(tid, 0)
            if remaining <= 0:
                continue

            # Choose session type
            if t["current_progress"] < 30:
                stype = "learning"
                duration = 60
            elif t["current_progress"] < 80:
                stype = "practice"
                duration = 45
            else:
                stype = "revision"
                duration = 35

            # Near exam: add mock tests
            days_left = t.get("days_to_exam")
            if days_left is not None and days_left <= 14 and t["current_progress"] >= 60:
                stype = "mock_test"
                duration = 90

            if current_time + duration > study_end:
                break

            end_t = current_time + duration
            if _conflicts_with_blocked(current_time, end_t, blocked_slots):
                current_time = _next_free_slot(current_time, end_t, blocked_slots)
                end_t = current_time + duration

            if current_time + duration > study_end:
                break

            sessions.append({
                "id": f"sess_{current_date.isoformat()}_{session_counter}",
                "subject_id": str(t["subject_id"]),
                "topic_id": tid,
                "subject_name": t.get("subject_name", ""),
                "topic_name": t["name"],
                "subject_color": t.get("subject_color", "#7C3AED"),
                "session_type": stype,
                "date": current_date.isoformat(),
                "start_time": minutes_to_time_str(current_time),
                "end_time": minutes_to_time_str(current_time + duration),
                "duration_minutes": duration,
                "status": "scheduled",
                "is_ai_generated": True,
            })
            session_counter += 1
            current_time += duration

            # Add break after every 2 sessions
            session_block += 1
            if session_block % 2 == 0:
                current_time += break_duration

            day_hours += duration / 60
            topic_hours_remaining[tid] = max(0, remaining - duration / 60)

            # Schedule first revision (spaced repetition: 1 day later)
            if tid not in revision_schedule and stype == "learning":
                revision_schedule[tid] = _spaced_revision_dates(current_date)

            if day_hours >= daily_hours:
                break

        daily_plans.append({
            "date": current_date.isoformat(),
            "day_name": current_date.strftime("%A"),
            "sessions": sessions,
            "total_hours": round(day_hours, 2),
            "is_available": True,
            "note": None,
        })
        total_study_hours += day_hours
        current_date += timedelta(days=1)

    # Compute recommended daily hours
    if available_days > 0:
        recommended = min(8.0, max(1.5, round(total_remaining_hours / available_days, 1)))
    else:
        recommended = daily_hours

    return {
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "recommended_daily_hours": recommended,
        "daily_plans": daily_plans,
        "topic_categories": topic_categories,
        "overloaded": overloaded,
        "overload_message": (
            "Your syllabus is large relative to available time. "
            "Topics are categorized into Must Study, Should Study, and Optional. "
            "Focus on Must Study topics to maximize your exam performance."
            if overloaded else None
        ),
        "total_sessions": session_counter,
        "total_study_hours": round(total_study_hours, 2),
        "subjects_covered": list({t.get("subject_name", "") for t in enriched_topics}),
        "ai_explanation": _generate_plan_explanation(
            enriched_topics, recommended, overloaded, start_date, end_date
        ),
    }


def redistribute_missed_sessions(
    missed_sessions: List[dict],
    existing_plan: List[dict],
    student_profile: dict,
    from_date: date,
) -> List[dict]:
    """Redistribute missed sessions into future available slots without overloading."""
    prefs = student_profile.get("preferences", {})
    daily_hours = prefs.get("daily_study_hours", 4.0)
    weekend_study = prefs.get("weekend_study", True)
    saturday = prefs.get("saturday_available", True)
    sunday = prefs.get("sunday_available", True)

    # Build a map of future days -> current load
    future_load: Dict[str, float] = {}
    for day_plan in existing_plan:
        d = day_plan.get("date", "")
        if d >= from_date.isoformat():
            future_load[d] = day_plan.get("total_hours", 0.0)

    rescheduled = []
    for missed in missed_sessions:
        duration_h = missed.get("duration_minutes", 45) / 60
        # Find earliest future day with capacity
        check_date = from_date
        placed = False
        for _ in range(30):
            day_str = check_date.isoformat()
            if _is_day_available(check_date, weekend_study, saturday, sunday):
                current_load = future_load.get(day_str, 0.0)
                if current_load + duration_h <= daily_hours + 0.5:  # allow 30min buffer
                    future_load[day_str] = current_load + duration_h
                    new_session = missed.copy()
                    new_session["date"] = day_str
                    new_session["status"] = "scheduled"
                    new_session["rescheduled_from"] = missed.get("date")
                    rescheduled.append(new_session)
                    placed = True
                    break
            check_date += timedelta(days=1)
        if not placed:
            # Mark as optional / dropped
            missed["status"] = "dropped"
            rescheduled.append(missed)

    return rescheduled


def _enrich_topics(topics: List[dict], subjects: List[dict], start_date: date) -> List[dict]:
    subject_map = {str(s["_id"]): s for s in subjects}
    enriched = []
    for t in topics:
        subj = subject_map.get(str(t.get("subject_id", "")), {})
        exam_date_raw = subj.get("exam_date")
        if exam_date_raw:
            if isinstance(exam_date_raw, str):
                exam_date = date.fromisoformat(exam_date_raw)
            elif isinstance(exam_date_raw, datetime):
                exam_date = exam_date_raw.date()
            else:
                exam_date = exam_date_raw
            days_to_exam = (exam_date - start_date).days
        else:
            days_to_exam = None

        score = compute_priority_score(
            t.get("difficulty", 3),
            t.get("importance", 3),
            t.get("current_progress", 0),
            days_to_exam,
        )
        enriched.append({
            **t,
            "subject_name": subj.get("name", "Unknown"),
            "subject_color": subj.get("color", "#7C3AED"),
            "days_to_exam": days_to_exam,
            "priority_score": score,
        })
    return enriched


def _get_planning_end_date(subjects: List[dict], start_date: date) -> date:
    latest = start_date + timedelta(days=90)
    for s in subjects:
        ed = s.get("exam_date")
        if ed:
            if isinstance(ed, str):
                ed = date.fromisoformat(ed)
            elif isinstance(ed, datetime):
                ed = ed.date()
            candidate = ed + timedelta(days=3)
            if candidate > latest:
                latest = candidate
    return min(latest, start_date + timedelta(days=120))


def _count_available_days(
    start: date, end: date, weekend_study: bool, sat: bool, sun: bool
) -> int:
    count = 0
    d = start
    while d <= end:
        if _is_day_available(d, weekend_study, sat, sun):
            count += 1
        d += timedelta(days=1)
    return count


def _is_day_available(d: date, weekend_study: bool, sat: bool, sun: bool) -> bool:
    wd = d.weekday()  # 5=sat, 6=sun
    if wd == 5:
        return weekend_study and sat
    if wd == 6:
        return weekend_study and sun
    return True


def _get_blocked_slots(class_timings: List[dict], day_name: str) -> List[Tuple[int, int]]:
    slots = []
    for ct in class_timings:
        if ct.get("day", "").lower() == day_name:
            start = time_str_to_minutes(ct.get("start_time", "09:00"))
            end = time_str_to_minutes(ct.get("end_time", "17:00"))
            slots.append((start, end))
    return slots


def _conflicts_with_blocked(start: int, end: int, blocked: List[Tuple[int, int]]) -> bool:
    for bs, be in blocked:
        if start < be and end > bs:
            return True
    return False


def _next_free_slot(start: int, end: int, blocked: List[Tuple[int, int]]) -> int:
    for bs, be in blocked:
        if start < be and end > bs:
            return be + 5  # 5 min padding after class ends
    return start


def _spaced_revision_dates(study_date: date) -> List[date]:
    """Spaced repetition: 1 day, 3 days, 7 days, 14 days after initial study."""
    return [
        study_date + timedelta(days=1),
        study_date + timedelta(days=3),
        study_date + timedelta(days=7),
        study_date + timedelta(days=14),
    ]


def _get_revision_sessions(
    revision_schedule: Dict[str, List[date]],
    current_date: date,
    enriched_topics: List[dict],
    raw_topics: List[dict],
) -> List[dict]:
    topic_map = {str(t["_id"]): t for t in enriched_topics}
    sessions = []
    for tid, dates in revision_schedule.items():
        if current_date in dates:
            t = topic_map.get(tid)
            if t:
                sessions.append({
                    "topic_id": tid,
                    "subject_id": str(t.get("subject_id", "")),
                    "topic_name": t["name"],
                    "subject_name": t.get("subject_name", ""),
                    "subject_color": t.get("subject_color", "#7C3AED"),
                })
    return sessions


def _generate_reasoning(topic: dict) -> str:
    reasons = []
    if topic.get("days_to_exam") is not None and topic["days_to_exam"] <= 14:
        reasons.append(f"exam in {topic['days_to_exam']} days")
    if topic.get("difficulty", 3) >= 4:
        reasons.append("high difficulty")
    if topic.get("importance", 3) >= 4:
        reasons.append("high importance")
    if topic.get("current_progress", 0) < 30:
        reasons.append("low completion")
    if not reasons:
        reasons.append("standard priority")
    return f"Prioritized because: {', '.join(reasons)}."


def _generate_plan_explanation(
    topics: List[dict],
    recommended_hours: float,
    overloaded: bool,
    start: date,
    end: date,
) -> str:
    must = sum(1 for t in topics if t.get("category") == "must_study")
    total_days = (end - start).days
    base = (
        f"Your personalized study plan spans {total_days} days starting {start.strftime('%B %d')}. "
        f"Based on your {len(topics)} topics across all subjects, "
        f"the AI recommends {recommended_hours} hours of study per day. "
        f"{must} topics have been flagged as Must Study due to upcoming exams or high importance. "
    )
    if overloaded:
        base += (
            "Your syllabus is extensive — topics are prioritized so you focus on what matters most. "
            "Optional topics can be reviewed if time permits after covering Must Study and Should Study topics."
        )
    else:
        base += "Your schedule is balanced and achievable. Stay consistent and you'll be well-prepared!"
    return base

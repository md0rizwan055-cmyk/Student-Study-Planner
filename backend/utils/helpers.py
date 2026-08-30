from datetime import date, datetime, timedelta, timezone
from typing import Optional
import re
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import HTTPException, status


def to_object_id(id_str: str, entity_name: str = "ID") -> ObjectId:
    """Convert string to BSON ObjectId with proper HTTP 400 validation."""
    try:
        return ObjectId(id_str)
    except (InvalidId, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {entity_name} format"
        )


def str_to_id(obj_id) -> str:
    """Convert MongoDB ObjectId to string."""
    return str(obj_id)


def calculate_days_to_exam(exam_date) -> Optional[int]:
    if not exam_date:
        return None
    if isinstance(exam_date, str):
        try:
            exam_date = date.fromisoformat(exam_date[:10])
        except ValueError:
            return None
    elif isinstance(exam_date, datetime):
        exam_date = exam_date.date()
    today = date.today()
    delta = exam_date - today
    return delta.days


def compute_priority_score(
    difficulty: int,
    importance: int,
    progress: float,
    days_to_exam: Optional[int],
) -> float:
    """
    Priority score 0.0 – 1.0
    Higher = must study sooner.
    """
    d = difficulty / 5.0          # 0.2 – 1.0
    i = importance / 5.0          # 0.2 – 1.0
    p = 1.0 - (progress / 100.0)  # 0.0 – 1.0  (incomplete portion)
    
    if days_to_exam is not None and days_to_exam > 0:
        urgency = min(1.0, 30.0 / days_to_exam)  # 30 days = max urgency scaling
    elif days_to_exam is not None and days_to_exam <= 0:
        urgency = 1.0
    else:
        urgency = 0.3  # no exam date

    score = (d * 0.25) + (i * 0.30) + (p * 0.25) + (urgency * 0.20)
    return round(min(score, 1.0), 4)


def categorize_topic(priority_score: float, days_to_exam: Optional[int], progress: float) -> str:
    if priority_score >= 0.65 or (days_to_exam is not None and days_to_exam <= 7):
        return "must_study"
    elif priority_score >= 0.40 or progress < 50:
        return "should_study"
    else:
        return "optional"


def time_str_to_minutes(time_str: str) -> int:
    """'09:30' -> 570"""
    h, m = map(int, time_str.split(":"))
    return h * 60 + m


def minutes_to_time_str(minutes: int) -> str:
    """570 -> '09:30'"""
    h = minutes // 60
    m = minutes % 60
    return f"{h:02d}:{m:02d}"


def get_day_name(d: date) -> str:
    return d.strftime("%A").lower()


def is_valid_hex_color(color: str) -> bool:
    return bool(re.match(r"^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$", color))


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def get_week_start(d: date) -> date:
    """Return Monday of the week containing d."""
    return d - timedelta(days=d.weekday())


MOTIVATIONAL_MESSAGES = [
    "Every expert was once a beginner. Keep going! 🚀",
    "Small consistent steps lead to big results. You've got this! 💪",
    "Progress, not perfection. Focus on today's plan! ⭐",
    "Your future self will thank you for studying today! 🎯",
    "Consistency is the key to mastery. Stay on track! 🔑",
    "One session at a time. You're building something great! 🏆",
    "The best time to study was yesterday. The second best time is now! ⏰",
]

STUDY_TIPS = [
    "Use the Pomodoro technique: 45 min study + 15 min break for maximum focus.",
    "Teach concepts to yourself out loud — it reveals gaps in understanding.",
    "Review your notes within 24 hours to boost long-term retention by 60%.",
    "Start with the most difficult topic when your energy is highest.",
    "Use active recall instead of re-reading — test yourself frequently.",
    "Write summaries in your own words after each study session.",
    "Take short breaks to walk or stretch — it improves memory consolidation.",
]

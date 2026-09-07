from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime, date


class ProgressOverview(BaseModel):
    total_topics: int
    completed_topics: int
    in_progress_topics: int
    overall_percent: float
    total_study_hours: float
    sessions_completed: int
    sessions_missed: int
    sessions_skipped: int
    current_streak: int
    longest_streak: int
    revisions_completed: int
    revisions_pending: int


class SubjectProgress(BaseModel):
    subject_id: str
    subject_name: str
    subject_color: str
    total_topics: int
    completed_topics: int
    progress_percent: float
    study_hours: float
    exam_date: Optional[date] = None
    days_to_exam: Optional[int] = None
    readiness_score: float  # 0-100


class WeeklyHours(BaseModel):
    week_label: str
    planned_hours: float
    actual_hours: float
    days: List[dict]


class StreakData(BaseModel):
    date: date
    studied: bool
    hours: float


class AnalyticsResponse(BaseModel):
    overview: ProgressOverview
    subjects: List[SubjectProgress]
    weekly_hours: List[WeeklyHours]
    streak_data: List[StreakData]
    completion_trend: List[dict]



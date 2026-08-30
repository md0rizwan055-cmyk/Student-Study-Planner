from pydantic import BaseModel, Field
from typing import Optional, List, Dict
from datetime import datetime, date


class PlannerGenerateRequest(BaseModel):
    start_date: Optional[date] = None  # defaults to today
    regenerate: bool = False
    reason: Optional[str] = None


class TopicPriority(BaseModel):
    topic_id: str
    topic_name: str
    subject_name: str
    priority_score: float
    category: str  # must_study/should_study/optional
    reasoning: str


class DailyPlan(BaseModel):
    date: date
    day_name: str
    sessions: List[dict]
    total_hours: float
    is_available: bool
    note: Optional[str] = None


class PlannerResponse(BaseModel):
    id: str
    user_id: str
    generated_at: datetime
    start_date: date
    end_date: date
    recommended_daily_hours: float
    daily_plans: List[DailyPlan]
    topic_categories: List[TopicPriority]
    overloaded: bool
    overload_message: Optional[str] = None
    total_sessions: int
    total_study_hours: float
    subjects_covered: List[str]
    ai_explanation: Optional[str] = None


class RecommendationResponse(BaseModel):
    what_to_study_today: List[dict]
    subjects_needing_attention: List[dict]
    upcoming_exam_alerts: List[dict]
    revision_due: List[dict]
    motivational_message: str
    study_tip: str

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date


class SessionCreate(BaseModel):
    subject_id: str
    topic_id: str
    session_type: str = Field(default="learning")  # learning/practice/revision/mock_test/assignment/buffer
    date: date
    start_time: str  # "09:00"
    duration_minutes: int = Field(..., ge=15, le=180)
    notes: Optional[str] = None


class SessionFeedback(BaseModel):
    rating: str  # easy/neutral/hard
    notes: Optional[str] = None
    actual_duration_minutes: Optional[int] = None


class SessionReschedule(BaseModel):
    new_date: date
    new_start_time: str


class SessionResponse(BaseModel):
    id: str
    user_id: str
    subject_id: str
    topic_id: str
    subject_name: str
    topic_name: str
    subject_color: str
    session_type: str
    date: date
    start_time: str
    end_time: str
    duration_minutes: int
    status: str  # scheduled/completed/skipped/missed
    feedback: Optional[dict] = None
    notes: Optional[str] = None
    is_ai_generated: bool = True
    created_at: datetime
    updated_at: datetime


class TimetableRequest(BaseModel):
    regenerate: bool = False
    reason: Optional[str] = None


class WeeklyTimetable(BaseModel):
    week_start: date
    week_end: date
    days: List[dict]
    total_sessions: int
    total_hours: float
    subjects_covered: List[str]

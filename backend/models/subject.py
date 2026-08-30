from pydantic import BaseModel, Field
from typing import Optional
from datetime import date, datetime


class SubjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    color: str = Field(default="#7C3AED")  # hex color for UI
    exam_date: Optional[date] = None
    total_marks: Optional[int] = Field(None, ge=0, le=1000)
    target_marks: Optional[int] = Field(None, ge=0, le=1000)
    notes: Optional[str] = None


class SubjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    color: Optional[str] = None
    exam_date: Optional[date] = None
    total_marks: Optional[int] = Field(None, ge=0, le=1000)
    target_marks: Optional[int] = Field(None, ge=0, le=1000)
    notes: Optional[str] = None


class SubjectResponse(BaseModel):
    id: str
    user_id: str
    name: str
    color: str
    exam_date: Optional[date] = None
    total_marks: Optional[int] = None
    target_marks: Optional[int] = None
    notes: Optional[str] = None
    total_topics: int = 0
    completed_topics: int = 0
    progress_percent: float = 0.0
    days_to_exam: Optional[int] = None
    created_at: datetime
    updated_at: datetime

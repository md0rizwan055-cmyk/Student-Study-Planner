from pydantic import BaseModel, Field, field_validator
from typing import Optional, Any
from datetime import date, datetime
from utils.helpers import parse_date_safe


class SubjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    color: str = Field(default="#7C3AED")  # hex color for UI
    exam_date: Optional[date] = None
    total_marks: Optional[int] = Field(None, ge=0, le=1000)
    target_marks: Optional[int] = Field(None, ge=0, le=1000)
    notes: Optional[str] = None

    @field_validator("exam_date", mode="before")
    @classmethod
    def validate_exam_date(cls, v: Any):
        if v is None or v == "":
            return None
        return parse_date_safe(v)

    @field_validator("total_marks", "target_marks", mode="before")
    @classmethod
    def validate_marks(cls, v: Any):
        if v is None or v == "":
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None

    @field_validator("color", mode="before")
    @classmethod
    def validate_color(cls, v: Any):
        if not v or not isinstance(v, str) or not v.strip():
            return "#7C3AED"
        return v.strip()


class SubjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    color: Optional[str] = None
    exam_date: Optional[date] = None
    total_marks: Optional[int] = Field(None, ge=0, le=1000)
    target_marks: Optional[int] = Field(None, ge=0, le=1000)
    notes: Optional[str] = None

    @field_validator("exam_date", mode="before")
    @classmethod
    def validate_exam_date(cls, v: Any):
        if v is None or v == "":
            return None
        return parse_date_safe(v)

    @field_validator("total_marks", "target_marks", mode="before")
    @classmethod
    def validate_marks(cls, v: Any):
        if v is None or v == "":
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None


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

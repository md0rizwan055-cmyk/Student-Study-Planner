from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Any
from datetime import datetime


class TopicCreate(BaseModel):
    subject_id: str
    name: str = Field(..., min_length=1, max_length=300)
    difficulty: int = Field(default=3, ge=1, le=5)  # 1=easy, 5=very hard
    importance: int = Field(default=3, ge=1, le=5)  # 1=low, 5=critical
    estimated_hours: float = Field(default=2.0, ge=0.5, le=50.0)
    current_progress: float = Field(default=0.0, ge=0.0, le=100.0)
    notes: Optional[str] = None
    order: Optional[int] = None

    @field_validator("difficulty", "importance", mode="before")
    @classmethod
    def validate_rating(cls, v: Any):
        if v is None or v == "":
            return 3
        try:
            return max(1, min(5, int(v)))
        except (ValueError, TypeError):
            return 3

    @field_validator("estimated_hours", mode="before")
    @classmethod
    def validate_hours(cls, v: Any):
        if v is None or v == "":
            return 2.0
        try:
            val = float(v)
            return max(0.5, min(50.0, val))
        except (ValueError, TypeError):
            return 2.0

    @field_validator("current_progress", mode="before")
    @classmethod
    def validate_progress(cls, v: Any):
        if v is None or v == "":
            return 0.0
        try:
            val = float(v)
            return max(0.0, min(100.0, val))
        except (ValueError, TypeError):
            return 0.0

    @field_validator("order", mode="before")
    @classmethod
    def validate_order(cls, v: Any):
        if v is None or v == "":
            return None
        try:
            return int(v)
        except (ValueError, TypeError):
            return None


class TopicUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=300)
    difficulty: Optional[int] = Field(None, ge=1, le=5)
    importance: Optional[int] = Field(None, ge=1, le=5)
    estimated_hours: Optional[float] = Field(None, ge=0.5, le=50.0)
    current_progress: Optional[float] = Field(None, ge=0.0, le=100.0)
    notes: Optional[str] = None
    status: Optional[str] = None  # not_started/in_progress/completed/needs_revision

    @field_validator("difficulty", "importance", mode="before")
    @classmethod
    def validate_rating(cls, v: Any):
        if v is None or v == "":
            return None
        try:
            return max(1, min(5, int(v)))
        except (ValueError, TypeError):
            return None

    @field_validator("estimated_hours", mode="before")
    @classmethod
    def validate_hours(cls, v: Any):
        if v is None or v == "":
            return None
        try:
            val = float(v)
            return max(0.5, min(50.0, val))
        except (ValueError, TypeError):
            return None

    @field_validator("current_progress", mode="before")
    @classmethod
    def validate_progress(cls, v: Any):
        if v is None or v == "":
            return None
        try:
            val = float(v)
            return max(0.0, min(100.0, val))
        except (ValueError, TypeError):
            return None


class TopicProgressUpdate(BaseModel):
    progress: float = Field(..., ge=0.0, le=100.0)
    feedback: Optional[str] = None  # easy/neutral/hard

    @field_validator("progress", mode="before")
    @classmethod
    def validate_progress(cls, v: Any):
        if v is None or v == "":
            return 0.0
        try:
            return max(0.0, min(100.0, float(v)))
        except (ValueError, TypeError):
            return 0.0


class TopicResponse(BaseModel):
    id: str
    subject_id: str
    user_id: str
    name: str
    difficulty: int
    importance: int
    estimated_hours: float
    current_progress: float
    status: str  # not_started/in_progress/completed/needs_revision
    priority_score: float
    last_studied: Optional[datetime] = None
    next_revision_date: Optional[datetime] = None
    revision_count: int = 0
    notes: Optional[str] = None
    order: Optional[int] = None
    created_at: datetime
    updated_at: datetime

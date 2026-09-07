from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime


class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str

    @field_validator("name")
    @classmethod
    def name_must_be_valid(cls, v):
        cleaned = v.replace(" ", "").replace("-", "").replace("'", "")
        if not cleaned.isalpha():
            raise ValueError("Name must contain only letters, spaces, hyphens, or apostrophes")
        return v.strip()

    @field_validator("confirm_password")
    @classmethod
    def passwords_match(cls, v, info):
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class StudyPreferences(BaseModel):
    daily_study_hours: float = Field(default=4.0, ge=0.5, le=16.0)
    preferred_study_time: str = Field(default="morning")  # morning/afternoon/evening/night
    break_duration_minutes: int = Field(default=15, ge=5, le=60)
    weekend_study: bool = True
    saturday_available: bool = True
    sunday_available: bool = True
    notification_enabled: bool = True
    exam_reminder_days: int = Field(default=7, ge=1, le=30)
    theme: str = Field(default="system")  # light/dark/system

    @field_validator("daily_study_hours", mode="before")
    @classmethod
    def validate_daily_hours(cls, v: Any):
        if v is None or v == "":
            return 4.0
        try:
            return max(0.5, min(16.0, float(v)))
        except (ValueError, TypeError):
            return 4.0

    @field_validator("break_duration_minutes", "exam_reminder_days", mode="before")
    @classmethod
    def validate_ints(cls, v: Any):
        if v is None or v == "":
            return 15
        try:
            return int(v)
        except (ValueError, TypeError):
            return 15


class ClassTiming(BaseModel):
    day: str  # monday/tuesday/...
    start_time: str = "09:00"  # "09:00"
    end_time: str = "17:00"  # "16:00"

    @field_validator("day", "start_time", "end_time", mode="before")
    @classmethod
    def validate_timing_strs(cls, v: Any):
        if v is None:
            return ""
        return str(v).strip()


class OnboardingData(BaseModel):
    college: Optional[str] = None
    academic_year: Optional[str] = None
    board_university: Optional[str] = None
    goals: Optional[str] = None
    existing_commitments: Optional[str] = None
    class_timings: Optional[List[ClassTiming]] = []
    preferences: Optional[StudyPreferences] = None

    @field_validator("college", "academic_year", "board_university", "goals", "existing_commitments", mode="before")
    @classmethod
    def empty_str_to_none(cls, v: Any):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return str(v).strip()


class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    onboarding_complete: bool
    created_at: datetime
    preferences: Optional[StudyPreferences] = None
    college: Optional[str] = None
    academic_year: Optional[str] = None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    college: Optional[str] = None
    academic_year: Optional[str] = None
    board_university: Optional[str] = None
    goals: Optional[str] = None

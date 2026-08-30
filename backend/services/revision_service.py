"""Spaced repetition revision scheduling service."""

from datetime import date, timedelta
from typing import List, Optional


REVISION_INTERVALS = [1, 3, 7, 14, 30]  # days after initial study


def schedule_revisions(topic_id: str, first_studied: date) -> List[date]:
    """Return list of revision dates using spaced repetition."""
    return [first_studied + timedelta(days=d) for d in REVISION_INTERVALS]


def get_next_revision_date(revision_count: int, last_studied: date) -> Optional[date]:
    """Get next revision date based on how many times studied."""
    if revision_count < len(REVISION_INTERVALS):
        return last_studied + timedelta(days=REVISION_INTERVALS[revision_count])
    return None  # Mastered — no more revisions needed


def is_revision_due(next_revision_date: Optional[date]) -> bool:
    if not next_revision_date:
        return False
    return date.today() >= next_revision_date


def adjust_interval_by_feedback(revision_count: int, feedback: str) -> int:
    """
    Adjust spaced repetition based on session feedback.
    easy -> increase interval, hard -> decrease interval.
    """
    if revision_count >= len(REVISION_INTERVALS):
        return 30

    base_interval = REVISION_INTERVALS[revision_count]
    if feedback == "easy":
        return int(base_interval * 1.5)
    elif feedback == "hard":
        return max(1, int(base_interval * 0.5))
    return base_interval

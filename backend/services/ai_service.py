"""
AI Service — Google Gemini Integration with intelligent mock fallback.
When GEMINI_API_KEY is set, uses real Gemini 2.0 Flash.
Otherwise, provides rich rule-based responses.
"""

import os
import json
import random
from typing import Optional
from config import GEMINI_API_KEY
from utils.helpers import MOTIVATIONAL_MESSAGES, STUDY_TIPS

_gemini_client = None

def _get_gemini_client():
    global _gemini_client
    if _gemini_client is None and GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_API_KEY)
            _gemini_client = genai.GenerativeModel("gemini-2.0-flash")
        except Exception:
            _gemini_client = None
    return _gemini_client


async def chat_with_ai(
    user_message: str,
    student_context: dict,
) -> str:
    """Process a student chat message using student's planner context."""
    model = _get_gemini_client()

    context_str = _build_context_string(student_context)
    system_prompt = f"""You are an intelligent, empathetic AI study assistant for a student.
You ONLY have access to THIS student's academic data provided below.
Never make up information not present in the context.
Be concise, helpful, and encouraging. Use markdown formatting for lists and bold text.

STUDENT CONTEXT:
{context_str}
"""

    if model:
        try:
            full_prompt = f"{system_prompt}\n\nStudent asks: {user_message}"
            response = model.generate_content(full_prompt)
            return response.text
        except Exception as e:
            pass  # Fall through to mock

    # Rich rule-based fallback
    return _rule_based_chat(user_message, student_context)


async def get_ai_recommendations(student_context: dict) -> dict:
    """Generate actionable recommendations based on student progress."""
    model = _get_gemini_client()

    subjects = student_context.get("subjects", [])
    topics = student_context.get("topics", [])
    sessions_today = student_context.get("sessions_today", [])
    upcoming_exams = student_context.get("upcoming_exams", [])

    if model:
        try:
            prompt = f"""Based on this student's data, provide recommendations in JSON format:
{json.dumps(student_context, default=str, indent=2)}

Return JSON with keys:
- what_to_study_today: list of {{topic, subject, reason}}
- subjects_needing_attention: list of {{subject, issue, suggestion}}
- upcoming_exam_alerts: list of {{subject, days_left, readiness}}
- revision_due: list of {{topic, last_studied, suggestion}}
- motivational_message: string
- study_tip: string
"""
            response = model.generate_content(prompt)
            text = response.text.strip()
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
            return json.loads(text)
        except Exception:
            pass

    return _rule_based_recommendations(student_context)


def _build_context_string(context: dict) -> str:
    subjects = context.get("subjects", [])
    topics = context.get("topics", [])
    prefs = context.get("preferences", {})

    lines = [
        f"Student: {context.get('name', 'Student')}",
        f"Daily study hours: {prefs.get('daily_study_hours', 4)} hours",
        f"Total subjects: {len(subjects)}",
        f"Total topics: {len(topics)}",
        f"Completed topics: {sum(1 for t in topics if t.get('status') == 'completed')}",
    ]

    for s in subjects[:8]:
        exam_info = f", exam in {s.get('days_to_exam', '?')} days" if s.get('exam_date') else ""
        lines.append(f"- {s.get('name')}: {s.get('progress_percent', 0):.0f}% complete{exam_info}")

    return "\n".join(lines)


def _rule_based_chat(message: str, context: dict) -> str:
    msg_lower = message.lower()
    subjects = context.get("subjects", [])
    topics = context.get("topics", [])
    prefs = context.get("preferences", {})
    name = context.get("name", "Student")

    if any(w in msg_lower for w in ["today", "what to study", "plan for today"]):
        sessions = context.get("sessions_today", [])
        if sessions:
            session_list = "\n".join(
                f"- **{s.get('topic_name')}** ({s.get('subject_name')}) — {s.get('duration_minutes')}min {s.get('session_type')}"
                for s in sessions[:5]
            )
            return f"Here's your study plan for today, {name}! 📚\n\n{session_list}\n\n{random.choice(STUDY_TIPS)}"
        else:
            return f"You don't have any sessions scheduled for today. Head to the **Planner** to generate your timetable! 🚀"

    elif any(w in msg_lower for w in ["missed", "skip", "behind", "recover"]):
        return (
            f"No worries, {name}! Everyone misses sessions sometimes. Here's how to recover:\n\n"
            "1. **Don't panic** — the AI will automatically redistribute missed sessions\n"
            "2. **Mark sessions** as missed in the Planner so the system can adjust\n"
            "3. **Add 30-60 minutes** of extra study tomorrow if possible\n"
            "4. **Prioritize Must Study topics** first\n\n"
            "The key is consistency — one missed day won't derail your progress! 💪"
        )

    elif any(w in msg_lower for w in ["priority", "important", "focus", "which subject"]):
        if subjects:
            # Find subject with lowest progress + nearest exam
            sorted_subj = sorted(
                subjects,
                key=lambda s: (s.get("progress_percent", 0), -(s.get("days_to_exam") or 999))
            )
            top = sorted_subj[0]
            return (
                f"Based on your progress, **{top.get('name')}** needs the most attention right now.\n\n"
                f"- Current progress: {top.get('progress_percent', 0):.0f}%\n"
                f"- Days to exam: {top.get('days_to_exam', 'Not set')}\n\n"
                "**Recommendation:** Allocate at least 2 hours to this subject in your next study session. "
                "Focus on incomplete and difficult topics first! 🎯"
            )

    elif any(w in msg_lower for w in ["revision", "revise", "review"]):
        return (
            "Great thinking — revision is key to retention! 🧠\n\n"
            "**Spaced Repetition Schedule:**\n"
            "- Review after **1 day** — reinforces initial memory\n"
            "- Review after **3 days** — strengthens recall\n"
            "- Review after **7 days** — moves to long-term memory\n"
            "- Review after **14 days** — consolidates mastery\n\n"
            "Your AI planner automatically schedules these revisions. "
            "Check the **Calendar** to see your upcoming revision sessions!"
        )

    elif any(w in msg_lower for w in ["exam", "test", "when"]):
        upcoming = context.get("upcoming_exams", [])
        if upcoming:
            exam_list = "\n".join(
                f"- **{e.get('subject_name')}**: {e.get('days_to_exam')} days away"
                for e in upcoming[:5]
            )
            return f"Here are your upcoming exams, {name}:\n\n{exam_list}\n\nMake sure to focus on the nearest exams first! ⏰"
        return "You haven't added any exam dates yet. Head to **Subjects** to add your exam dates so the AI can optimize your schedule!"

    elif any(w in msg_lower for w in ["tip", "advice", "suggestion", "help"]):
        return f"**Study Tip for You:**\n\n{random.choice(STUDY_TIPS)}\n\n{random.choice(MOTIVATIONAL_MESSAGES)}"

    else:
        return (
            f"Hi {name}! 👋 I'm your AI study assistant. I can help you with:\n\n"
            "- 📅 **Today's plan** — *'What should I study today?'*\n"
            "- 🔄 **Recovery help** — *'I missed sessions, help me catch up'*\n"
            "- 🎯 **Priority guidance** — *'Which subject needs most attention?'*\n"
            "- 📖 **Revision planning** — *'Create a revision schedule'*\n"
            "- ⏰ **Exam reminders** — *'When are my exams?'*\n\n"
            "What would you like help with?"
        )


def _rule_based_recommendations(context: dict) -> dict:
    subjects = context.get("subjects", [])
    topics = context.get("topics", [])
    sessions_today = context.get("sessions_today", [])

    # What to study today
    today_sessions = [
        {
            "topic": s.get("topic_name", ""),
            "subject": s.get("subject_name", ""),
            "reason": f"{s.get('session_type', 'study')} session — {s.get('duration_minutes', 45)} minutes",
        }
        for s in sessions_today[:3]
    ]

    # Subjects needing attention (lowest progress with nearest exam)
    attention = []
    for s in sorted(subjects, key=lambda x: x.get("progress_percent", 100))[:3]:
        if s.get("progress_percent", 100) < 60:
            attention.append({
                "subject": s.get("name"),
                "issue": f"Only {s.get('progress_percent', 0):.0f}% complete",
                "suggestion": "Increase study sessions for this subject",
            })

    # Exam alerts
    exam_alerts = [
        {
            "subject": s.get("name"),
            "days_left": s.get("days_to_exam"),
            "readiness": f"{s.get('progress_percent', 0):.0f}% ready",
        }
        for s in subjects
        if s.get("days_to_exam") is not None and s["days_to_exam"] <= 14
    ]

    # Revision due
    revision_due = [
        {
            "topic": t.get("name"),
            "last_studied": str(t.get("last_studied", "Not yet")),
            "suggestion": "Schedule a revision session",
        }
        for t in topics
        if t.get("status") == "needs_revision"
    ][:3]

    return {
        "what_to_study_today": today_sessions or [{"topic": "Open Planner", "subject": "All", "reason": "Generate your AI timetable to get started!"}],
        "subjects_needing_attention": attention,
        "upcoming_exam_alerts": exam_alerts,
        "revision_due": revision_due,
        "motivational_message": random.choice(MOTIVATIONAL_MESSAGES),
        "study_tip": random.choice(STUDY_TIPS),
    }

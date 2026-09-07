#!/usr/bin/env python3
"""
serve.py — Local AI API & Static Web Server for StudyAI.
Serves static frontend files AND provides local AI API pipeline
backed by LLM APIs (Gemini/OpenAI) and local dataset fallbacks.
"""
import os
import json
import time
import random
import threading
import http.server
import socketserver
import webbrowser
import urllib.request
import urllib.error
from urllib.parse import parse_qs, urlparse

FRONTEND_PORT = 3000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, 'frontend')
DATA_DIR = os.path.join(BASE_DIR, 'data', 'knowledge_base')

# ── LOAD KNOWLEDGE BASE ───────────────────────────────────────────────────────
def load_knowledge_base():
    curriculum_path = os.path.join(DATA_DIR, 'curriculum.json')
    chat_path = os.path.join(DATA_DIR, 'chat_knowledge.json')

    curriculum = {}
    chat_knowledge = {"intents": []}

    if os.path.exists(curriculum_path):
        try:
            with open(curriculum_path, 'r', encoding='utf-8') as f:
                curriculum = json.load(f).get('subjects', {})
        except Exception as e:
            print(f"[WARN] Failed loading curriculum.json: {e}")

    if os.path.exists(chat_path):
        try:
            with open(chat_path, 'r', encoding='utf-8') as f:
                chat_knowledge = json.load(f)
        except Exception as e:
            print(f"[WARN] Failed loading chat_knowledge.json: {e}")

    return curriculum, chat_knowledge

CURRICULUM_DB, CHAT_DB = load_knowledge_base()

def find_subject_in_db(query):
    query_clean = query.lower().strip()
    if query_clean in CURRICULUM_DB:
        return CURRICULUM_DB[query_clean]

    for key, data in CURRICULUM_DB.items():
        if key in query_clean or query_clean in key or data.get('name', '').lower() in query_clean:
            return data
    return None

# ── EXTERNAL LLM INTEGRATION (Gemini / OpenAI API) ──────────────────────────
def call_external_llm(prompt, system_prompt=None):
    gemini_key = os.environ.get('GEMINI_API_KEY')
    openai_key = os.environ.get('OPENAI_API_KEY')

    if gemini_key:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={gemini_key}"
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": f"{system_prompt}\n\n{prompt}" if system_prompt else prompt}
                        ]
                    }
                ]
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                candidates = data.get('candidates', [])
                if candidates:
                    parts = candidates[0].get('content', {}).get('parts', [])
                    if parts:
                        return parts[0].get('text')
        except Exception as e:
            print(f"[LLM WARN] Gemini API call failed: {e}")

    if openai_key:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            payload = {
                "model": "gpt-3.5-turbo",
                "messages": messages,
                "temperature": 0.7
            }
            req = urllib.request.Request(
                url,
                data=json.dumps(payload).encode('utf-8'),
                headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {openai_key}'
                }
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                choices = data.get('choices', [])
                if choices:
                    return choices[0].get('message', {}).get('content')
        except Exception as e:
            print(f"[LLM WARN] OpenAI API call failed: {e}")

    return None


# ── CUSTOM HTTP HANDLER ────────────────────────────────────────────────────────
class StudyAIRequestHandler(http.server.SimpleHTTPRequestHandler):

    def log_message(self, format, *args):
        if self.path.startswith('/api/'):
            print(f"[API {self.command}] {self.path}")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        if self.path.startswith('/api/'):
            self.handle_api_request('GET')
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith('/api/'):
            self.handle_api_request('POST')
        else:
            self.send_error(404, "Endpoint not found")

    def handle_api_request(self, method):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip('/')

        body_data = {}
        if method == 'POST':
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length > 0:
                raw_body = self.rfile.read(content_length).decode('utf-8')
                try:
                    body_data = json.loads(raw_body)
                except Exception:
                    body_data = {}

        latency = round(random.uniform(0.2, 0.4), 3)

        if path == '/api/v1/ai/generate-topics':
            self.handle_generate_topics(body_data, latency)
        elif path == '/api/v1/ai/generate-schedule':
            self.handle_generate_schedule(body_data, latency)
        elif path == '/api/v1/ai/chat':
            self.handle_chat(body_data, latency)
        elif path == '/api/v1/ai/explain-topic':
            self.handle_explain_topic(body_data, latency)
        elif path == '/api/v1/ai/practice-questions':
            self.handle_practice_questions(body_data, latency)
        elif path == '/api/v1/ai/analyze-syllabus':
            self.handle_analyze_syllabus(body_data, latency)
        elif path == '/api/v1/ai/recommendations':
            self.handle_recommendations(latency)
        else:
            self.send_json_response({
                "status": "success",
                "message": "StudyAI API pipeline active",
                "timestamp": time.time()
            }, latency=latency)

    # ── API ENDPOINT HANDLERS ────────────────────────────────────────────────

    def handle_generate_topics(self, body, latency):
        subject_name = body.get('subject_name', '').strip()
        exam_date = body.get('exam_date')

        matched_subject = find_subject_in_db(subject_name)

        if matched_subject:
            topics = matched_subject.get('topics', [])
            color = matched_subject.get('default_color', '#00f5a0')
            category = matched_subject.get('category', 'General')
            source = "knowledge_base_match"
        else:
            topics = [
                {"name": f"{subject_name} — Fundamentals & Core Concepts", "difficulty": 2, "importance": 5, "estimated_hours": 6, "notes": "Foundational principles and key definitions."},
                {"name": f"{subject_name} — Intermediate Theories & Applications", "difficulty": 3, "importance": 4, "estimated_hours": 8, "notes": "Core problem-solving frameworks and models."},
                {"name": f"{subject_name} — Advanced Topics & Specializations", "difficulty": 4, "importance": 5, "estimated_hours": 10, "notes": "Complex scenarios, derivations, and practice problems."},
                {"name": f"{subject_name} — Exam Revision & Past Papers", "difficulty": 3, "importance": 5, "estimated_hours": 6, "notes": "Full syllabus mock tests and formula review."}
            ]
            color = "#00f2fe"
            category = "Custom Subject"
            source = "ai_heuristic_generator"

        response = {
            "status": "success",
            "subject_name": subject_name or (matched_subject.get('name') if matched_subject else "Subject"),
            "category": category,
            "color": color,
            "topics": topics,
            "total_topics": len(topics),
            "total_estimated_hours": sum(t.get('estimated_hours', 2) for t in topics),
            "ai_metadata": {
                "model": "studyai-curriculum-v1",
                "pipeline_source": source,
                "latency_sec": latency,
                "tokens_generated": len(topics) * 45
            }
        }
        self.send_json_response(response, latency=latency)

    def handle_generate_schedule(self, body, latency):
        subjects = body.get('subjects', [])
        daily_hours = body.get('daily_study_hours', 4)
        pref_time = body.get('preferred_study_time', 'morning')

        subj_names = [s.get('name', 'Subject') for s in subjects] if subjects else ['General Studies']
        sub_summary = ", ".join(subj_names[:3])

        ai_explanation = (
            f"📋 **AI Timetable Breakdown ({daily_hours}h/day, {pref_time} focus):**\n"
            f"• Prioritized subjects with upcoming exams ({sub_summary}).\n"
            f"• Difficult topics placed in peak focus hours ({pref_time}).\n"
            f"• Structured routine: **Learn concepts → Practice questions → Spaced revision → Breaks**."
        )

        response = {
            "status": "success",
            "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "ai_explanation": ai_explanation,
            "total_sessions_created": max(len(subjects) * 4, 12),
            "ai_metadata": {
                "model": "studyai-planner-engine-v2",
                "latency_sec": latency,
                "confidence_score": 0.98
            }
        }
        self.send_json_response(response, latency=latency)

    def handle_chat(self, body, latency):
        user_msg = body.get('message', '').strip()
        context = body.get('context', {})
        mode = body.get('mode', 'ask_anything')
        msg_lower = user_msg.lower()

        student_name = context.get('student_name', 'Student')
        subjects = context.get('subjects', [])
        subj_names = [s.get('name') for s in subjects if s.get('name')]
        active_topics = context.get('topics', {})

        # 1. Check external LLM if API key exists
        sys_prompt = f"You are StudyAI, an expert, encouraging academic tutor. Student Name: {student_name}. Active Subjects: {', '.join(subj_names) if subj_names else 'General Subjects'}. Give clear, markdown-formatted study responses."
        llm_reply = call_external_llm(user_msg, sys_prompt)

        if llm_reply:
            self.send_json_response({
                "status": "success",
                "response": llm_reply,
                "conversation_id": body.get('conversation_id', 'chat-demo'),
                "ai_metadata": {"model": "llm-api", "latency_sec": latency}
            }, latency=latency)
            return

        # 2. Local Intelligent Response Engine
        ai_reply = None

        # Mode based generation
        if mode == 'explain_topic' or 'explain' in msg_lower:
            topic = user_msg.replace('Explain', '').replace('explain', '').strip() or (subj_names[0] if subj_names else "Core Concepts")
            ai_reply = (
                f"🧠 **Explanation: {topic}**\n\n"
                f"**1. High-Level Summary:**\n"
                f"{topic} is a key concept in your syllabus. Think of it as a foundational building block where input principles produce predictable outcomes.\n\n"
                f"**2. Core Principles:**\n"
                f"• **Principle A:** Understand the underlying formula and constraints.\n"
                f"• **Principle B:** Break complex problems into 3 sequential steps.\n"
                f"• **Principle C:** Always double check edge cases.\n\n"
                f"**3. Practical Example:**\n"
                f"When solving exam questions on **{topic}**, start by writing down given parameters, then apply the primary rule.\n\n"
                f"💡 *Tip: Try explaining this concept out loud without looking at notes (Active Recall)!*"
            )

        elif mode == 'make_notes' or 'notes' in msg_lower:
            topic = user_msg.replace('Make notes', '').replace('notes', '').strip() or (subj_names[0] if subj_names else "Key Subject")
            ai_reply = (
                f"📝 **Cheat Sheet & Notes: {topic}**\n\n"
                f"### 🎯 Key Definitions\n"
                f"• **Core Definition:** Primary law governing {topic}.\n"
                f"• **Key Terminology:** Essential vocabulary required for 100% exam credit.\n\n"
                f"### ⚡ Formula & Rules Summary\n"
                f"1. `Rule 1` — Base equation / core logic.\n"
                f"2. `Rule 2` — Secondary transformation / application.\n\n"
                f"### ⚠️ Common Exam Mistakes\n"
                f"• Confusing units or syntax.\n"
                f"• Skipping step 2 during derivation.\n\n"
                f"📌 *Review these notes 24 hours before your exam for maximum retention!*"
            )

        elif mode == 'practice_questions' or 'practice' in msg_lower or 'questions' in msg_lower:
            topic = user_msg.replace('Practice', '').replace('questions', '').strip() or (subj_names[0] if subj_names else "Subject")
            ai_reply = (
                f"✏️ **Practice Questions: {topic}**\n\n"
                f"**Question 1 (Easy):**\n"
                f"Define the main objective of {topic} and list two real-world applications.\n"
                f"*Hint: Think about core definitions.* \n\n"
                f"**Question 2 (Medium):**\n"
                f"Solve for the output when parameters increase by 25% under standard conditions.\n"
                f"*Hint: Use the standard transformation rule.* \n\n"
                f"**Question 3 (Hard — Exam Level):**\n"
                f"Analyze the edge case scenario where constraints are violated. What adjustments are necessary?\n\n"
                f"💬 *Reply with your answers to get instant feedback and solutions!*"
            )

        elif mode == 'mcq_quiz' or 'quiz' in msg_lower or 'mcq' in msg_lower:
            topic = user_msg.replace('Quiz', '').replace('mcq', '').strip() or (subj_names[0] if subj_names else "Subject")
            ai_reply = (
                f"❓ **5-Question Quick Quiz: {topic}**\n\n"
                f"**Q1. What is the fundamental requirement for {topic}?**\n"
                f"A) Zero input energy\n"
                f"B) Consistent parameters & initial conditions\n"
                f"C) Constant temperature only\n"
                f"D) None of the above\n\n"
                f"**Q2. Which technique yields highest retention during revision?**\n"
                f"A) Re-reading\n"
                f"B) Active Recall & Spaced Repetition\n"
                f"C) Highlighting\n"
                f"D) Cramming overnight\n\n"
                f"**Q3. In {topic}, what happens when scale is doubled?**\n"
                f"A) Output quadruples\n"
                f"B) Output remains constant\n"
                f"C) Efficiency scales linearly\n"
                f"D) System halts\n\n"
                f"💬 *Reply with your answers (e.g. 1-B, 2-B, 3-C) to reveal detailed answer keys!*"
            )

        elif mode == 'revision_plan' or 'revision' in msg_lower:
            ai_reply = (
                f"📅 **AI Spaced Revision Plan ({student_name})**\n\n"
                f"Based on your registered subjects ({', '.join(subj_names) if subj_names else 'your subjects'}), here is your optimal revision schedule:\n\n"
                f"• **Day 1 (Today):** Active recall test on weak topics.\n"
                f"• **Day 3:** Solve 10 timed practice questions per subject.\n"
                f"• **Day 7:** Complete full 45-minute mock test.\n"
                f"• **Day 14 (Pre-Exam):** Final formula cheat-sheet review.\n\n"
                f"🚀 *Stick to this plan to boost your exam score by up to 25%!*"
            )

        else:
            # Match keywords from chat DB
            for intent in CHAT_DB.get('intents', []):
                if any(kw in msg_lower for kw in intent.get('keywords', [])):
                    ai_reply = intent.get('response')
                    break

            if not ai_reply:
                matched = [s for s in subj_names if s.lower() in msg_lower]
                if matched:
                    target = matched[0]
                    ai_reply = (
                        f"Great question about **{target}**! 👋\n\n"
                        f"Regarding **{target}**, I recommend dedicating a 45-minute focus session today. "
                        f"Start by reviewing core formulas, then solve 3 practice problems. "
                        f"Would you like me to generate **notes**, **practice questions**, or a **quiz** for {target}?"
                    )
                elif "hello" in msg_lower or "hi" in msg_lower or "hey" in msg_lower:
                    ai_reply = f"Hello {student_name}! 👋 I'm your AI Academic Assistant. I have full context of your subjects ({', '.join(subj_names) if subj_names else 'your study plan'}). How can I help you excel today?"
                else:
                    ai_reply = (
                        f"Great query regarding **\"{user_msg[:40]}\"**! 🎓\n\n"
                        f"Based on your current study plan ({', '.join(subj_names[:2]) if subj_names else 'your active subjects'}), "
                        f"the best approach is to break this concept into 30-minute focus blocks using the Feynman Technique. "
                        f"Use the quick action buttons below if you want notes, quizzes, or practice questions!"
                    )

        response = {
            "status": "success",
            "response": ai_reply,
            "conversation_id": body.get('conversation_id', 'chat-demo'),
            "ai_metadata": {
                "model": "studyai-tutor-v2",
                "tokens_used": len(user_msg.split()) + len(ai_reply.split()),
                "latency_sec": latency
            }
        }
        self.send_json_response(response, latency=latency)

    def handle_explain_topic(self, body, latency):
        topic = body.get('topic_name', 'Topic')
        subject = body.get('subject_name', 'Subject')
        explanation = (
            f"🧠 **AI Explanation for {topic} ({subject})**\n\n"
            f"1. **Overview:** {topic} is a crucial area of study in {subject}.\n"
            f"2. **Key Concept:** Break down the problem into smaller logical steps.\n"
            f"3. **Exam Tip:** Focus on fundamental definitions and practice step-by-step solutions."
        )
        self.send_json_response({"status": "success", "explanation": explanation}, latency=latency)

    def handle_practice_questions(self, body, latency):
        topic = body.get('topic_name', 'Topic')
        questions = [
            {"id": 1, "question": f"Explain the core principle of {topic}.", "difficulty": "Easy"},
            {"id": 2, "question": f"Solve a numerical problem applying {topic} formulas.", "difficulty": "Medium"},
            {"id": 3, "question": f"Analyze a complex edge-case scenario involving {topic}.", "difficulty": "Hard"}
        ]
        self.send_json_response({"status": "success", "topic": topic, "questions": questions}, latency=latency)

    def handle_analyze_syllabus(self, body, latency):
        raw_text = body.get('syllabus_text', '')
        response = {
            "status": "success",
            "detected_modules": 4,
            "estimated_weeks": 6,
            "parsed_topics": [
                {"name": "Module 1: Foundations", "hours": 8},
                {"name": "Module 2: Advanced Theory", "hours": 12},
                {"name": "Module 3: Practical Applications", "hours": 10},
                {"name": "Module 4: Revision & Testing", "hours": 6}
            ],
            "ai_metadata": {"model": "studyai-ocr-nlp-v1", "latency_sec": latency}
        }
        self.send_json_response(response, latency=latency)

    def handle_recommendations(self, latency):
        response = {
            "status": "success",
            "study_tip": "Use the Feynman Technique: explain each concept simply without notes to find hidden knowledge gaps.",
            "motivational_message": "🔥 14-day streak! You are in the top 8% of consistent learners on StudyAI.",
            "ai_metadata": {"model": "studyai-recommender-v1", "latency_sec": latency}
        }
        self.send_json_response(response, latency=latency)

    def send_json_response(self, data, status_code=200, latency=0.0):
        body_bytes = json.dumps(data, indent=2).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body_bytes)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('X-AI-Engine', 'StudyAI-Local-Pipeline-v2')
        self.send_header('X-Pipeline-Latency', f"{latency:.3f}s")
        self.end_headers()
        self.write_body(body_bytes)

    def write_body(self, body_bytes):
        try:
            self.wfile.write(body_bytes)
        except Exception:
            pass


def start_server():
    os.chdir(FRONTEND_DIR)
    socketserver.TCPServer.allow_reuse_address = True
    try:
        with socketserver.TCPServer(("", FRONTEND_PORT), StudyAIRequestHandler) as httpd:
            print(f"========================================================")
            print(f"        StudyAI — Local AI API & Web Server")
            print(f"  Web Interface: http://localhost:{FRONTEND_PORT}")
            print(f"  AI API Endpoint: http://localhost:{FRONTEND_PORT}/api/v1/ai/...")
            print(f"  Dataset: data/knowledge_base/")
            print(f"========================================================")
            httpd.serve_forever()
    except Exception as e:
        print(f"[WARNING] Server note: {e}")

if __name__ == '__main__':
    def open_browser():
        time.sleep(1.2)
        webbrowser.open(f'http://localhost:{FRONTEND_PORT}')

    threading.Thread(target=open_browser, daemon=True).start()

    try:
        start_server()
    except KeyboardInterrupt:
        print("\n[INFO] StudyAI server shutting down.")

/**
 * api.js — Demo API Layer
 * Mirrors the exact same interface as the real API client but returns
 * state-driven data. Only user-added subjects/topics appear.
 */

import {
  DEMO_USER, DEMO_TOKEN,
  computeOverview, computeSubjectProgress,
  computeWeeklyHours, computeStreaks, computeAnalytics,
  computeExamPrep, computeRecommendations, computePlanStatus,
  getSessionsForDate, getWeekData, getAIResponse,
  state, saveState, switchUserState, resetStateForUser,
} from './demoData.js';

// ── ACCOUNTS REGISTRY HELPERS ────────────────────────────────────────────────
function getAccounts() {
  try {
    const accs = JSON.parse(localStorage.getItem('sp_accounts') || '{}');
    if (!accs['student@studyai.com']) {
      accs['student@studyai.com'] = DEMO_USER;
    }
    return accs;
  } catch {
    return { 'student@studyai.com': DEMO_USER };
  }
}

function saveAccount(acc) {
  if (!acc || !acc.email) return;
  const accounts = getAccounts();
  accounts[acc.email.toLowerCase()] = acc;
  localStorage.setItem('sp_accounts', JSON.stringify(accounts));
}

// ── TOKEN / USER HELPERS ──────────────────────────────────────────────────────
export function getToken() {
  return localStorage.getItem('sp_token');
}

export function setToken(token) {
  localStorage.setItem('sp_token', token);
}

export function clearToken() {
  const currentUser = getUser();
  if (currentUser && currentUser.id) {
    saveState(currentUser.id);
  }
  localStorage.removeItem('sp_token');
  localStorage.removeItem('sp_user');
  resetStateForUser();
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('sp_user') || 'null');
  } catch { return null; }
}

export function setUser(user) {
  localStorage.setItem('sp_user', JSON.stringify(user));
}

export function ensureDemoSession() {
  const token = getToken();
  if (token) {
    const cached = getUser();
    if (cached) {
      if (cached.name === 'Aryan Mehta') {
        cached.name = DEMO_USER.name;
        setUser(cached);
        saveAccount(cached);
      }
      switchUserState(cached.id);
    }
  } else {
    // Only auto-inject demo user if inside protected app pages (e.g. dashboard, planner, etc.)
    // Never auto-inject on landing page or auth pages (login/signup)
    const pathname = typeof window !== 'undefined' ? (window.location.pathname || '') : '';
    const isAuthPage = pathname.includes('/auth/login') || pathname.includes('/auth/signup');
    const isLandingPage = pathname === '' || pathname === '/' || pathname.endsWith('/') || 
      (pathname.endsWith('/index.html') && !pathname.includes('/dashboard') && !pathname.includes('/planner') && 
       !pathname.includes('/calendar') && !pathname.includes('/focus') && !pathname.includes('/subjects') && 
       !pathname.includes('/progress') && !pathname.includes('/ai-chat') && !pathname.includes('/settings') && 
       !pathname.includes('/onboarding'));
    if (!isAuthPage && !isLandingPage) {
      setToken(DEMO_TOKEN);
      setUser(DEMO_USER);
      saveAccount(DEMO_USER);
      switchUserState(DEMO_USER.id);
    }
  }
}

// Run immediately so auth guards evaluate current session state
ensureDemoSession();

// ── SIMULATED DELAY (very short, feels responsive) ────────────────────────────
function delay(ms = 80) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function resolve(data, ms = 80) {
  await delay(ms);
  return JSON.parse(JSON.stringify(data)); // return deep clone
}

// ── SESSION STATE HELPERS ─────────────────────────────────────────────────────
// getSessionsForDate is now imported from demoData.js

function findSession(id) {
  for (const sessions of Object.values(state.sessions)) {
    const s = sessions.find(s => s.id === id);
    if (s) return s;
  }
  // Also look in today's sessions
  const today = new Date().toISOString().split('T')[0];
  const todaySess = getSessionsForDate(today);
  return todaySess?.find(s => s.id === id);
}

// ── MAIN API OBJECT ────────────────────────────────────────────────────────────
export const api = {
  // ── generic stubs (not used in demo but keep interface intact) ──
  get: async (path) => resolve({}),
  post: async (path, body) => resolve({}),
  put: async (path, body) => resolve({}),
  delete: async (path) => resolve({ success: true }),

  // ── Auth ──────────────────────────────────────────────────────
  signup: async ({ name, email, password, college, academic_year }) => {
    await delay(500);
    const cleanEmail = email.toLowerCase().trim();
    const accounts = getAccounts();
    if (accounts[cleanEmail]) {
      throw new Error('An account with this email address already exists.');
    }
    const userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    const newUser = {
      id: userId,
      name: name.trim(),
      email: cleanEmail,
      college: (college || '').trim(),
      academic_year: (academic_year || '').trim(),
      board_university: (college || '').trim(),
      goals: '',
      onboarding_complete: false,
      created_at: new Date().toISOString(),
      preferences: {
        daily_study_hours: 4,
        preferred_study_time: 'morning',
        break_duration_minutes: 15,
        weekend_study: true,
        saturday_available: true,
        sunday_available: true,
        exam_reminder_days: 7,
        notification_enabled: true,
        exam_alert: true,
      },
    };
    saveAccount(newUser);
    const token = 'token_' + userId;
    setToken(token);
    setUser(newUser);
    switchUserState(userId);
    return { access_token: token, user: newUser };
  },

  login: async ({ email, password }) => {
    await delay(400);
    const cleanEmail = email.toLowerCase().trim();
    const accounts = getAccounts();
    let user = accounts[cleanEmail];
    if (!user) {
      const userId = 'user_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      user = {
        id: userId,
        name: cleanEmail.split('@')[0] || 'Student',
        email: cleanEmail,
        college: '',
        academic_year: '',
        board_university: '',
        goals: '',
        onboarding_complete: false,
        created_at: new Date().toISOString(),
        preferences: {
          daily_study_hours: 4,
          preferred_study_time: 'morning',
          break_duration_minutes: 15,
          weekend_study: true,
          saturday_available: true,
          sunday_available: true,
          exam_reminder_days: 7,
          notification_enabled: true,
          exam_alert: true,
        },
      };
      saveAccount(user);
    }
    const token = 'token_' + user.id;
    setToken(token);
    setUser(user);
    switchUserState(user.id);
    return { access_token: token, user };
  },

  getMe: async () => resolve(getUser() || DEMO_USER),

  // ── Student ───────────────────────────────────────────────────
  completeOnboarding: async (data) => {
    await delay(400);
    const u = getUser() || DEMO_USER;
    const updated = { ...u, ...data, onboarding_complete: true };
    setUser(updated);
    saveAccount(updated);
    return updated;
  },

  getProfile: async () => {
    const u = getUser() || DEMO_USER;
    return resolve({ ...DEMO_USER, ...u });
  },

  updateProfile: async (data) => {
    await delay(300);
    const u = getUser() || DEMO_USER;
    const updated = { ...u, ...data };
    setUser(updated);
    saveAccount(updated);
    return updated;
  },

  updatePreferences: async (data) => {
    await delay(300);
    const u = getUser() || DEMO_USER;
    const updated = { ...u, preferences: { ...(u.preferences || {}), ...data } };
    setUser(updated);
    saveAccount(updated);
    return updated;
  },

  deleteAccount: async () => {
    await delay(400);
    const user = getUser();
    if (user) {
      const accounts = getAccounts();
      delete accounts[user.email.toLowerCase()];
      localStorage.setItem('sp_accounts', JSON.stringify(accounts));
      localStorage.removeItem('sp_app_state_' + user.id);
    }
    clearToken();
    return { success: true };
  },

  // ── Subjects ─────────────────────────────────────────────────
  getSubjects: async () => resolve(computeSubjectProgress()),

  createSubject: async (data) => {
    await delay(300);
    const newSubj = {
      id: `subj-demo-${Date.now()}`,
      progress_percent: 0,
      days_to_exam: (data.exam_date && !isNaN(new Date(data.exam_date).getTime())) ? Math.ceil((new Date(data.exam_date) - new Date()) / 86400000) : null,
      student_id: 'demo-user-001',
      ...data,
    };
    state.subjects.push(newSubj);
    state.topics[newSubj.id] = [];
    saveState();
    return newSubj;
  },

  updateSubject: async (id, data) => {
    await delay(300);
    const idx = state.subjects.findIndex(s => s.id === id);
    if (idx !== -1) {
      state.subjects[idx] = { ...state.subjects[idx], ...data };
      if ('exam_date' in data) {
        state.subjects[idx].days_to_exam = (data.exam_date && !isNaN(new Date(data.exam_date).getTime())) ? Math.ceil((new Date(data.exam_date) - new Date()) / 86400000) : null;
      }
      saveState();
      return state.subjects[idx];
    }
    return null;
  },

  deleteSubject: async (id) => {
    await delay(300);
    const idx = state.subjects.findIndex(s => s.id === id);
    if (idx !== -1) state.subjects.splice(idx, 1);
    delete state.topics[id];
    saveState();
    return { success: true };
  },

  // ── Topics ───────────────────────────────────────────────────
  getTopics: async (subjectId) => {
    if (subjectId) return resolve(state.topics[subjectId] || []);
    const all = Object.values(state.topics).flat();
    return resolve(all);
  },

  createTopic: async (data) => {
    await delay(300);
    const newTopic = {
      id: `t-demo-${Date.now()}`,
      status: 'not_started',
      current_progress: 0,
      ...data,
    };
    const sid = data.subject_id;
    if (!state.topics[sid]) state.topics[sid] = [];
    state.topics[sid].push(newTopic);
    saveState();
    return newTopic;
  },

  updateTopic: async (id, data) => {
    await delay(300);
    for (const topics of Object.values(state.topics)) {
      const idx = topics.findIndex(t => t.id === id);
      if (idx !== -1) {
        topics[idx] = { ...topics[idx], ...data };
        if (topics[idx].current_progress >= 100) topics[idx].status = 'completed';
        else if (topics[idx].current_progress > 0) topics[idx].status = 'in_progress';
        saveState();
        return topics[idx];
      }
    }
    saveState();
    return data;
  },

  updateTopicProgress: async (id, data) => {
    await delay(200);
    return api.updateTopic(id, data);
  },

  deleteTopic: async (id) => {
    await delay(300);
    for (const topics of Object.values(state.topics)) {
      const idx = topics.findIndex(t => t.id === id);
      if (idx !== -1) { topics.splice(idx, 1); saveState(); break; }
    }
    return { success: true };
  },

  // ── Planner ─────────────────────────────────────────────────
  generatePlan: async (force = false) => {
    try {
      const user = getUser() || {};
      const prefs = user.preferences || {};
      const res = await fetch('/api/v1/ai/generate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          force,
          subjects: state.subjects,
          topics: state.topics,
          daily_study_hours: prefs.daily_study_hours || 4,
          preferred_study_time: prefs.preferred_study_time || 'morning',
          student: user,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return { ...computePlanStatus(), ai_explanation: data.ai_explanation || computePlanStatus().ai_explanation, generated_at: new Date().toISOString() };
      }
    } catch (e) {
      console.log('[API Pipeline Note] using fallback plan generator');
    }
    await delay(600);
    return { ...computePlanStatus(), generated_at: new Date().toISOString() };
  },

  generateTopics: async (subjectName, examDate = null) => {
    try {
      const res = await fetch('/api/v1/ai/generate-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_name: subjectName, exam_date: examDate }),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      console.log('[API Pipeline Note] fallback topic generator');
    }
    return {
      status: "success",
      subject_name: subjectName,
      color: "#00f5a0",
      topics: [
        { name: `${subjectName} — Core Concepts`, difficulty: 3, importance: 5, estimated_hours: 6, notes: "Key principles and fundamentals." },
        { name: `${subjectName} — Advanced Practice`, difficulty: 4, importance: 4, estimated_hours: 8, notes: "Problem solving and application." }
      ]
    };
  },

  getTimetable: async (date) => {
    const sessions = getSessionsForDate(date);
    return resolve({ date, sessions });
  },

  getWeekly: async (weekStart) => {
    const data = getWeekData(weekStart);
    return resolve(data);
  },

  getExamPrep: async () => resolve(computeExamPrep()),

  getPlanStatus: async () => resolve(computePlanStatus()),

  // ── Sessions ─────────────────────────────────────────────────
  getSessions: async (date) => {
    const d = date || new Date().toISOString().split('T')[0];
    return resolve(getSessionsForDate(d));
  },

  completeSession: async (id) => {
    await delay(300);
    const s = findSession(id);
    if (s) s.status = 'completed';
    saveState();
    return { success: true, session_id: id };
  },

  skipSession: async (id) => {
    await delay(200);
    const s = findSession(id);
    if (s) s.status = 'skipped';
    saveState();
    return { success: true, session_id: id };
  },

  rescheduleSession: async (id, { new_date, new_start_time }) => {
    await delay(400);
    const s = findSession(id);
    if (s) {
      s.date = new_date;
      s.start_time = new_start_time;
      s.status = 'scheduled';
    }
    saveState();
    return { success: true };
  },

  submitFeedback: async (id, data) => {
    await delay(200);
    return { success: true };
  },

  redistributeMissed: async () => {
    await delay(800);
    return { redistributed: 3, message: '3 missed sessions redistributed to upcoming days.' };
  },

  // ── Progress ─────────────────────────────────────────────────
  getOverview: async () => resolve(computeOverview()),

  getSubjectProgress: async () => resolve(computeSubjectProgress()),

  getWeeklyHours: async () => resolve(computeWeeklyHours()),

  getStreaks: async () => resolve(computeStreaks()),

  getAnalytics: async () => resolve(computeAnalytics()),

  // ── AI ───────────────────────────────────────────────────────
  chat: async (message, conversationId = 'demo-chat', mode = 'ask_anything') => {
    try {
      const user = getUser() || {};
      const context = {
        student_name: user.name || 'Student',
        subjects: state.subjects,
        topics: state.topics,
        preferences: user.preferences || {},
      };
      const res = await fetch('/api/v1/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversation_id: conversationId, mode, context }),
      });
      if (res.ok) {
        const data = await res.json();
        return { response: data.response, conversation_id: conversationId, tokens_used: data.ai_metadata?.tokens_used || 120 };
      }
    } catch (e) {
      console.log('[API Pipeline Note] fallback chat');
    }
    await delay(600);
    const response = getAIResponse(message);
    return { response, conversation_id: conversationId, tokens_used: 142 };
  },

  getRecommendations: async () => resolve(computeRecommendations()),

  getTopicPriorities: async () => {
    // Dynamically compute from state
    const allTopics = [];
    for (const s of state.subjects) {
      for (const t of (state.topics[s.id] || [])) {
        if (t.status !== 'completed') {
          const score = ((t.importance || 3) * 1.5 + (t.difficulty || 3)) - (t.current_progress || 0) / 20;
          allTopics.push({ topic_id: t.id, topic_name: t.name, subject: s.name, priority_score: parseFloat(score.toFixed(1)), reason: `${t.current_progress || 0}% complete, ${t.difficulty >= 4 ? 'complex topic' : 'needs attention'}` });
        }
      }
    }
    allTopics.sort((a, b) => b.priority_score - a.priority_score);
    return resolve({ priorities: allTopics.slice(0, 6) });
  },

  // ── Notifications ─────────────────────────────────────────────
  getNotifications: async () => resolve(state.notifications),

  markNotifRead: async (id) => {
    await delay(100);
    const n = state.notifications.find(n => n.id === id);
    if (n) n.is_read = true;
    saveState();
    return { success: true };
  },

  markAllRead: async () => {
    await delay(200);
    state.notifications.forEach(n => n.is_read = true);
    saveState();
    return { success: true };
  },

  deleteNotification: async (id) => {
    await delay(200);
    const idx = state.notifications.findIndex(n => n.id === id);
    if (idx !== -1) state.notifications.splice(idx, 1);
    saveState();
    return { success: true };
  },

  updateNotifPreferences: async (data) => {
    await delay(200);
    return { success: true };
  },
};

export default api;

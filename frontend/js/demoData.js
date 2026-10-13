/**
 * demoData.js — Dynamic state-driven data layer for StudyAI
 * State starts EMPTY. Only user-added subjects/topics appear.
 * All derived data (overview, progress, sessions, recommendations, etc.)
 * is computed dynamically from the current state.
 */

// ── DATE HELPERS ─────────────────────────────────────────────────────────────
export function formatDateISO(d = new Date()) {
  if (!(d instanceof Date) || isNaN(d)) return '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseISODate(dateStr) {
  if (!dateStr) return new Date();
  const parts = dateStr.split('-');
  if (parts.length !== 3) return new Date(dateStr);
  return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
}

function todayStr() { return formatDateISO(new Date()); }
function dateOffset(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return formatDateISO(d);
}
function mondayOfCurrentWeek() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun, 1=Mon ...
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatDateISO(d);
}

// ── DEMO USER ─────────────────────────────────────────────────────────────────
export const DEMO_USER = {
  id: 'demo-user-001',
  name: 'Student',
  email: 'student@studyai.com',
  college: 'IIT Delhi',
  academic_year: '2nd Year',
  board_university: 'IIT Delhi',
  goals: 'Score above 85% in all semester exams and crack GATE 2027.',
  onboarding_complete: true,
  created_at: '2026-06-01T00:00:00Z',
  preferences: {
    daily_study_hours: 6,
    preferred_study_time: 'morning',
    break_duration_minutes: 15,
    weekend_study: true,
    saturday_available: true,
    sunday_available: false,
    exam_reminder_days: 7,
    notification_enabled: true,
    exam_alert: true,
  },
};

export const DEMO_TOKEN = 'demo-token-Md-Rizwan-2026';

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
export const NOTIFICATIONS = [
  { id: 'notif-001', type: 'tip', title: '💡 Welcome to StudyAI!', message: 'Add your subjects and topics to get started with your AI-powered study plan.', is_read: false, created_at: new Date().toISOString() },
  { id: 'notif-002', type: 'tip', title: '💡 Study Tip', message: 'Try the Pomodoro technique: 25 min focus → 5 min break. Studies show it increases retention by 29%.', is_read: true, created_at: new Date(Date.now() - 24 * 3600 * 1000).toISOString() },
];

// ══════════════════════════════════════════════════════════════════════════════
// ── MUTABLE STATE — starts EMPTY, populated by user actions, saved to storage ──
// ══════════════════════════════════════════════════════════════════════════════
export const state = {
  subjects: [],
  topics: {},       // subjectId → topic[]
  sessions: {},     // dateStr → session[]   (populated lazily by session builder)
  notifications: JSON.parse(JSON.stringify(NOTIFICATIONS)),
};

function getActiveUserId() {
  try {
    const userStr = localStorage.getItem('sp_user');
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u && u.id) return u.id;
    }
  } catch (e) {}
  return DEMO_USER.id;
}

function getStateKey(userId) {
  const uid = userId || getActiveUserId();
  return `sp_app_state_${uid}`;
}

// Week cache (declared here so it's available to clearWeekCache/loadState at init time)
const _weekCache = {};

export function clearWeekCache() {
  for (const k in _weekCache) delete _weekCache[k];
}

export function resetStateForUser() {
  state.subjects = [];
  state.topics = {};
  state.sessions = {};
  state.notifications = JSON.parse(JSON.stringify(NOTIFICATIONS));
  clearWeekCache();
}

export function saveState(targetUserId) {
  try {
    clearWeekCache();
    const key = getStateKey(targetUserId);
    localStorage.setItem(key, JSON.stringify({
      subjects: state.subjects,
      topics: state.topics,
      sessions: state.sessions,
      notifications: state.notifications,
    }));
  } catch (e) {
    console.error('[StudyAI] Failed to save state:', e);
  }
}

export function loadState(targetUserId) {
  try {
    clearWeekCache();
    const userId = targetUserId || getActiveUserId();
    const key = getStateKey(userId);

    // Migration logic: if legacy state exists and target is demo user, migrate to scoped key
    if (userId === DEMO_USER.id && !localStorage.getItem(key)) {
      const legacyRaw = localStorage.getItem('sp_app_state_v1');
      if (legacyRaw) {
        localStorage.setItem(key, legacyRaw);
      }
    }

    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.subjects = parsed.subjects || [];
      state.topics = parsed.topics || {};
      state.sessions = parsed.sessions || {};
      state.notifications = parsed.notifications || JSON.parse(JSON.stringify(NOTIFICATIONS));
    } else {
      resetStateForUser();
    }
  } catch (e) {
    console.error('[StudyAI] Failed to load state:', e);
    resetStateForUser();
  }
}

export function switchUserState(userId) {
  loadState(userId);
}

// Load state automatically on module initialization
loadState();

// ══════════════════════════════════════════════════════════════════════════════
// ── DYNAMIC COMPUTE FUNCTIONS — always derived from state ────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── SUBJECT PROGRESS ─────────────────────────────────────────────────────────
export function computeSubjectProgress() {
  return state.subjects.map(s => {
    const topics = state.topics[s.id] || [];
    const total = topics.length;
    const completed = topics.filter(t => t.status === 'completed').length;
    const inProgress = topics.filter(t => t.status === 'in_progress').length;
    const studyHours = topics.reduce((a, t) => a + (t.estimated_hours || 0) * (t.current_progress || 0) / 100, 0);
    const progressPct = total > 0
      ? Math.round(topics.reduce((a, t) => a + (t.current_progress || 0), 0) / total)
      : (s.progress_percent || 0);
    const rawDays = (s.days_to_exam != null && !isNaN(s.days_to_exam)) ? s.days_to_exam : (s.exam_date && !isNaN(new Date(s.exam_date).getTime()) ? Math.ceil((new Date(s.exam_date) - new Date()) / 86400000) : null);
    const daysLeft = (typeof rawDays === 'number' && !isNaN(rawDays)) ? rawDays : null;
    const readiness = Math.round(progressPct * 0.9 + ((daysLeft && daysLeft > 20) ? 10 : (daysLeft && daysLeft > 10) ? 5 : 0));

    return {
      ...s,
      id: s.id,
      name: s.name,
      color: s.color || '#00f5a0',
      subject_id: s.id,
      subject_name: s.name,
      subject_color: s.color || '#00f5a0',
      progress_percent: progressPct,
      readiness_score: Math.min(readiness, 98),
      completed_topics: completed,
      in_progress_topics: inProgress,
      total_topics: total,
      study_hours: parseFloat(studyHours.toFixed(1)),
      days_to_exam: daysLeft,
      exam_date: s.exam_date || null,
    };
  });
}

// ── OVERVIEW ─────────────────────────────────────────────────────────────────
export function computeOverview() {
  const allTopics = Object.values(state.topics).flat();
  const totalTopics = allTopics.length;
  const completedTopics = allTopics.filter(t => t.status === 'completed').length;
  const inProgressTopics = allTopics.filter(t => t.status === 'in_progress').length;
  const notStartedTopics = totalTopics - completedTopics - inProgressTopics;
  const overallPct = totalTopics > 0
    ? Math.round(allTopics.reduce((a, t) => a + (t.current_progress || 0), 0) / totalTopics)
    : 0;
  const totalStudyHours = parseFloat(
    allTopics.reduce((a, t) => a + (t.estimated_hours || 0) * (t.current_progress || 0) / 100, 0).toFixed(1)
  );

  // Count completed/missed/skipped sessions across all cached dates
  let sessionsCompleted = 0, sessionsMissed = 0, sessionsSkipped = 0;
  for (const sessions of Object.values(state.sessions)) {
    for (const s of sessions) {
      if (s.status === 'completed') sessionsCompleted++;
      else if (s.status === 'missed') sessionsMissed++;
      else if (s.status === 'skipped') sessionsSkipped++;
    }
  }

  const streakInfo = computeStreaks();

  return {
    overall_percent: overallPct,
    total_topics: totalTopics,
    completed_topics: completedTopics,
    in_progress_topics: inProgressTopics,
    not_started_topics: notStartedTopics,
    total_study_hours: totalStudyHours,
    sessions_completed: sessionsCompleted,
    sessions_missed: sessionsMissed,
    sessions_skipped: sessionsSkipped,
    current_streak: streakInfo.current_streak,
    longest_streak: streakInfo.longest_streak,
    avg_daily_hours: streakInfo.total_study_days > 0 ? parseFloat((totalStudyHours / Math.max(1, streakInfo.total_study_days)).toFixed(1)) : 0,
    study_efficiency: totalTopics > 0 ? Math.min(Math.round(overallPct * 1.1), 100) : 0,
  };
}

// ── WEEKLY HOURS ─────────────────────────────────────────────────────────────
export function computeWeeklyHours() {
  const weeks = [];
  const hasSubjects = state.subjects.length > 0;
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const label = `Week of ${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`;
    const isCurrent = i === 0;
    if (!hasSubjects) {
      weeks.push({ week_label: label, planned_hours: 0, actual_hours: 0 });
    } else {
      const planned = isCurrent ? 20 : 18 + Math.round(Math.random() * 6);
      const actual = isCurrent
        ? parseFloat((Math.random() * 8).toFixed(1))
        : parseFloat((planned * (0.55 + Math.random() * 0.35)).toFixed(1));
      weeks.push({ week_label: label, planned_hours: planned, actual_hours: actual });
    }
  }
  return weeks;
}

// ── STREAKS & HEATMAP ────────────────────────────────────────────────────────
export function computeStreaks() {
  const heatmap = [];
  const today = new Date();
  const todayDateStr = todayStr();
  const hasSubjects = state.subjects.length > 0;
  let streak = 0, longestStreak = 0, currentStreak = 0, totalDays = 0;

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = formatDateISO(d);
    const dayOfWeek = d.getDay();
    let studied = false;
    let hours = 0;

    // First check if sessions exist in state for this date
    if (state.sessions[dateStr]) {
      const completedSess = state.sessions[dateStr].filter(s => s.status === 'completed');
      if (completedSess.length > 0) {
        studied = true;
        hours = parseFloat((completedSess.reduce((acc, s) => acc + (s.duration_minutes || 0) / 60, 0)).toFixed(1));
      }
    } else if (hasSubjects) {
      // Historical simulation for past dates beyond cached range
      const rand = Math.sin(i * 12.9898 + (d.getMonth() + 1) * 78.233) * 43758.5453;
      const normRand = rand - Math.floor(rand);
      if (dayOfWeek === 0) {
        studied = normRand < 0.25;
      } else if (i < 14) {
        studied = normRand < 0.85;
      } else {
        studied = normRand < 0.65;
      }
      if (studied) {
        hours = parseFloat((1.5 + (normRand * 3.5)).toFixed(1));
      }
    }

    // For today specifically, if state.sessions has no completed sessions, studied is false
    if (dateStr === todayDateStr && state.sessions[todayDateStr]) {
      const todayDone = state.sessions[todayDateStr].filter(s => s.status === 'completed');
      studied = todayDone.length > 0;
      hours = studied ? parseFloat((todayDone.reduce((acc, s) => acc + (s.duration_minutes || 0) / 60, 0)).toFixed(1)) : 0;
    }

    heatmap.push({ date: dateStr, studied, hours });

    if (studied) {
      streak++;
      totalDays++;
      if (streak > longestStreak) longestStreak = streak;
    } else {
      streak = 0;
    }
  }

  // Calculate current active streak ending at today or yesterday
  currentStreak = 0;
  const lastIndex = heatmap.length - 1;
  const todayStudied = heatmap[lastIndex]?.studied;
  const yesterdayStudied = heatmap[lastIndex - 1]?.studied;

  if (todayStudied) {
    for (let i = lastIndex; i >= 0; i--) {
      if (heatmap[i].studied) currentStreak++;
      else break;
    }
  } else if (yesterdayStudied) {
    for (let i = lastIndex - 1; i >= 0; i--) {
      if (heatmap[i].studied) currentStreak++;
      else break;
    }
  }

  return {
    current_streak: currentStreak,
    longest_streak: Math.max(longestStreak, currentStreak),
    total_study_days: totalDays,
    heatmap,
  };
}

// ── DAILY ANALYTICS ──────────────────────────────────────────────────────────
export function computeDailyAnalytics(targetDateStr, daysCount = 7) {
  const today = todayStr();
  const baseDateStr = targetDateStr || today;
  const baseDate = new Date(baseDateStr + 'T00:00:00');
  const days = [];

  for (let i = daysCount - 1; i >= 0; i--) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - i);
    const dateStr = formatDateISO(d);
    const sessions = getSessionsForDate(dateStr) || [];

    const isPast = dateStr < today;
    const isToday = dateStr === today;

    const totalScheduled = sessions.length;
    const completed = sessions.filter(s => s.status === 'completed').length;
    const skipped = sessions.filter(s => s.status === 'skipped').length;
    const missed = sessions.filter(s => s.status === 'missed').length;
    const scheduled = sessions.filter(s => s.status === 'scheduled').length;

    const scheduledPastDue = isPast ? scheduled : 0;
    const remaining = !isPast ? scheduled : 0;

    const completedMinutes = sessions
      .filter(s => s.status === 'completed')
      .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const studyHours = parseFloat((completedMinutes / 60).toFixed(1));

    const denominator = completed + skipped + scheduledPastDue;
    const completionPercentage = denominator > 0
      ? Math.round((completed / denominator) * 100)
      : (completed > 0 ? 100 : 0);

    days.push({
      date: dateStr,
      day_name: d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
      day_label: d.toLocaleDateString('en-IN', { weekday: 'short' }),
      is_today: isToday,
      is_selected: dateStr === baseDateStr,
      total_scheduled: totalScheduled,
      completed,
      skipped,
      missed: missed + scheduledPastDue,
      remaining,
      study_minutes: completedMinutes,
      study_hours: studyHours,
      completion_percentage: completionPercentage,
      sessions,
    });
  }

  const totalStudyMinutes = days.reduce((sum, d) => sum + d.study_minutes, 0);
  const totalCompleted = days.reduce((sum, d) => sum + d.completed, 0);
  const totalScheduledSum = days.reduce((sum, d) => sum + d.total_scheduled, 0);
  const avgCompletionPct = days.length > 0 ? Math.round(days.reduce((sum, d) => sum + d.completion_percentage, 0) / days.length) : 0;

  return {
    selected_date: baseDateStr,
    days,
    summary: {
      total_study_hours: parseFloat((totalStudyMinutes / 60).toFixed(1)),
      total_completed: totalCompleted,
      total_scheduled: totalScheduledSum,
      avg_completion_pct: avgCompletionPct,
    }
  };
}

// ── ANALYTICS ────────────────────────────────────────────────────────────────
export function computeAnalytics() {
  const completion_trend = [];
  const today = new Date();
  const hasSubjects = state.subjects.length > 0;
  let cumulative = 0;

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = formatDateISO(d);
    const daySessions = state.sessions[dateStr];
    let completed = 0;
    if (daySessions) {
      completed = daySessions.filter(s => s.status === 'completed').length;
    } else if (hasSubjects) {
      const rand = Math.sin(i * 12.9898 + (d.getMonth() + 1) * 78.233) * 43758.5453;
      completed = (rand - Math.floor(rand)) > 0.5 ? 1 : 0;
    }
    cumulative += completed;
    completion_trend.push({ date: dateStr, completed_topics: completed, cumulative_topics: cumulative });
  }

  const ov = computeOverview();
  return {
    completion_trend,
    avg_session_rating: hasSubjects ? 4.1 : 0,
    most_productive_time: 'morning',
    total_focus_sessions: ov.sessions_completed,
    avg_focus_duration: hasSubjects ? 52 : 0,
  };
}

// ── EXAM PREP ────────────────────────────────────────────────────────────────
export function computeExamPrep() {
  const subjectProgress = computeSubjectProgress();
  const withExams = subjectProgress.filter(s => s.days_to_exam != null);
  withExams.sort((a, b) => (a.days_to_exam || 999) - (b.days_to_exam || 999));

  return {
    upcoming_exams: withExams.map(s => ({
      subject_id: s.subject_id,
      subject_name: s.subject_name,
      subject_color: s.subject_color,
      exam_date: s.exam_date,
      days_left: s.days_to_exam,
      readiness_percent: s.readiness_score,
      completed_topics: s.completed_topics,
      total_topics: s.total_topics,
    })),
  };
}

// ── RECOMMENDATIONS ──────────────────────────────────────────────────────────
export function computeRecommendations() {
  const subjectProgress = computeSubjectProgress();

  if (subjectProgress.length === 0) {
    return {
      study_tip: 'Add your subjects and topics to receive personalized AI study recommendations!',
      motivational_message: '🚀 Get started by adding your first subject — your AI study assistant is ready to help!',
      what_to_study_today: [],
      subjects_needing_attention: [],
      upcoming_exam_alerts: [],
    };
  }

  const TIPS = [
    'Use the Feynman Technique: explain each concept as if teaching a 12-year-old — it reveals gaps in your understanding faster than re-reading.',
    'Active Recall is 3x more effective than passive re-reading. Close your notes and try to write everything you remember.',
    'Spaced Repetition: review after 1, 3, 7, and 14 days to move knowledge to long-term memory.',
    'Interleave your study: mix topics from different subjects in one session for stronger neural connections.',
    'The Pomodoro Technique (25 min focus + 5 min break) can increase retention by up to 29%.',
  ];

  // What to study today: pick topics that need work
  const allTopics = [];
  for (const s of state.subjects) {
    for (const t of (state.topics[s.id] || [])) {
      if (t.status !== 'completed') {
        allTopics.push({ topic: t.name, subject: s.name, reason: `${t.current_progress || 0}% complete — ${t.difficulty >= 4 ? 'complex topic, needs daily practice' : 'keep building momentum'}` });
      }
    }
  }
  // Sort: lowest progress first
  allTopics.sort((a, b) => {
    const progA = parseInt(a.reason) || 0;
    const progB = parseInt(b.reason) || 0;
    return progA - progB;
  });

  // Subjects needing attention: lowest progress
  const needAttention = subjectProgress
    .filter(s => s.progress_percent < 60)
    .slice(0, 2)
    .map(s => ({
      subject: s.subject_name,
      issue: `Only ${s.progress_percent}% complete${s.days_to_exam ? ` with exam in ${s.days_to_exam} days` : ''}`,
      suggestion: 'Increase daily study time for this subject',
    }));

  // Exam alerts
  const examAlerts = subjectProgress
    .filter(s => s.days_to_exam != null && s.days_to_exam <= 21)
    .map(s => ({
      subject: s.subject_name,
      days_left: s.days_to_exam,
      readiness: `${s.readiness_score}% ready`,
    }));

  return {
    study_tip: TIPS[Math.floor(Math.random() * TIPS.length)],
    motivational_message: `🔥 You have ${state.subjects.length} subject${state.subjects.length !== 1 ? 's' : ''} tracked. Stay consistent and you'll ace your exams!`,
    what_to_study_today: allTopics.slice(0, 3),
    subjects_needing_attention: needAttention,
    upcoming_exam_alerts: examAlerts,
  };
}

// ── PLAN STATUS ──────────────────────────────────────────────────────────────
export function computePlanStatus() {
  const hasSubjects = state.subjects.length > 0;
  const allTopics = Object.values(state.topics).flat();

  if (!hasSubjects) {
    return {
      has_plan: false,
      generated_at: null,
      ai_explanation: 'Add subjects and topics first, then generate your AI study plan.',
      total_sessions: 0,
      sessions_remaining: 0,
    };
  }

  // Build explanation from actual subjects
  const subNames = state.subjects.map(s => s.name).join(', ');
  return {
    has_plan: true,
    generated_at: new Date().toISOString(),
    ai_explanation: `📋 Your AI plan covers ${subNames}. Topics are scheduled by difficulty and exam proximity. Harder topics are placed in morning focus blocks for maximum retention.`,
    total_sessions: Math.max(allTopics.length * 4, 12),
    sessions_remaining: Math.max(allTopics.length * 3, 8),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// ── DYNAMIC SESSION BUILDERS — generate from state only ──────────────────────
// ══════════════════════════════════════════════════════════════════════════════

let _sessionIdCounter = 1;
function makeSession(dateStr, startTime, topicId, topicName, subjectId, subjectName, subjectColor, durationMins, sessionType, status) {
  return {
    id: `sess-${String(_sessionIdCounter++).padStart(4, '0')}`,
    date: dateStr,
    start_time: startTime,
    topic_id: topicId,
    topic_name: topicName,
    subject_id: subjectId,
    subject_name: subjectName,
    subject_color: subjectColor,
    duration_minutes: durationMins,
    session_type: sessionType,
    status: status,
    student_id: 'demo-user-001',
  };
}

// Build a pool of study items from state
function _buildStudyPool() {
  const pool = [];
  for (const subj of state.subjects) {
    const topics = state.topics[subj.id] || [];
    for (const t of topics) {
      pool.push({
        topicId: t.id,
        topicName: t.name,
        subjectId: subj.id,
        subjectName: subj.name,
        subjectColor: subj.color || '#00f5a0',
        difficulty: t.difficulty || 3,
        importance: t.importance || 3,
        progress: t.current_progress || 0,
        status: t.status || 'not_started',
        estimatedHours: t.estimated_hours || 4,
      });
    }
  }
  // Sort by: incomplete first, then by importance desc, difficulty desc
  pool.sort((a, b) => {
    if (a.status === 'completed' && b.status !== 'completed') return 1;
    if (a.status !== 'completed' && b.status === 'completed') return -1;
    if (b.importance !== a.importance) return b.importance - a.importance;
    return b.difficulty - a.difficulty;
  });
  return pool;
}

const SESSION_TYPES = ['learning', 'practice', 'revision'];
const START_TIMES = ['07:30', '09:00', '10:30', '12:00', '14:00', '15:30', '17:00', '18:30'];
const DURATIONS = [45, 60, 60, 90, 60, 45, 60, 45];

function _buildDaySessions(dateStr, pool, dayIndex, isPast, isToday) {
  if (pool.length === 0) return [];

  // Get user preferences
  let dailyStudyHours = 4;
  let preferredTime = 'morning';
  let breakMinutes = 15;
  try {
    const userStr = localStorage.getItem('sp_user');
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u && u.preferences) {
        dailyStudyHours = parseFloat(u.preferences.daily_study_hours) || 4;
        preferredTime = u.preferences.preferred_study_time || 'morning';
        breakMinutes = parseInt(u.preferences.break_duration_minutes) || 15;
      }
    }
  } catch (e) {}

  // Adjust hours for weekends
  let targetMinutes = Math.round(dailyStudyHours * 60);
  if (dayIndex === 6) targetMinutes = Math.round(targetMinutes * 0.5);       // Sunday
  else if (dayIndex === 5) targetMinutes = Math.round(targetMinutes * 0.75);  // Saturday

  // Determine start time based on preference
  const startHours = { 'morning': 7, 'afternoon': 12, 'evening': 16, 'night': 20 };
  let currentHour = (startHours[preferredTime] || 7) + Math.floor(Math.random() * 1);
  let currentMinute = (Math.floor(Math.random() * 2)) * 30; // 0 or 30

  // Build sessions that total approximately targetMinutes
  const sessions = [];
  let remainingMinutes = targetMinutes;
  let sessionIdx = 0;

  while (remainingMinutes > 0 && sessionIdx < pool.length * 2 && sessionIdx < 8) {
    const item = pool[sessionIdx % pool.length];
    // Session duration: 45-90 min, but don't exceed remaining
    let dur = Math.min(remainingMinutes, [60, 90, 45, 60, 75, 45, 60, 90][sessionIdx % 8]);
    if (dur < 25) break; // Skip tiny sessions

    const time = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    const sessionType = SESSION_TYPES[sessionIdx % SESSION_TYPES.length];

    let status;
    if (isPast) {
      const rand = Math.random();
      status = rand < 0.72 ? 'completed' : rand < 0.88 ? 'skipped' : 'missed';
    } else if (isToday) {
      status = sessionIdx < 1 ? 'completed' : 'scheduled';
    } else {
      status = 'scheduled';
    }

    sessions.push(makeSession(dateStr, time, item.topicId, item.topicName, item.subjectId, item.subjectName, item.subjectColor, dur, sessionType, status));

    remainingMinutes -= dur;

    // Advance clock by duration + break
    const advance = dur + breakMinutes;
    currentMinute += advance;
    currentHour += Math.floor(currentMinute / 60);
    currentMinute = currentMinute % 60;

    // Add lunch break if crossing noon
    if (currentHour >= 12 && currentHour < 14 && preferredTime === 'morning' && sessionIdx < 3) {
      currentHour = 14;
      currentMinute = 0;
    }

    sessionIdx++;
  }

  return sessions;
}

export function generateAISchedule(force = true) {
  let dailyStudyHours = 4;
  let preferredTime = 'morning';
  let breakMinutes = 15;
  try {
    const userStr = localStorage.getItem('sp_user');
    if (userStr) {
      const u = JSON.parse(userStr);
      if (u && u.preferences) {
        dailyStudyHours = parseFloat(u.preferences.daily_study_hours) || 4;
        preferredTime = u.preferences.preferred_study_time || 'morning';
        breakMinutes = parseInt(u.preferences.break_duration_minutes) || 15;
      }
    }
  } catch (e) {}

  if (force) {
    state.sessions = {};
    clearWeekCache();
  }

  const pool = _buildStudyPool();
  if (pool.length === 0) {
    saveState();
    return;
  }

  // Priority sort
  pool.sort((a, b) => {
    const daysA = a.examDate ? Math.max(1, Math.ceil((new Date(a.examDate) - new Date()) / 86400000)) : 999;
    const daysB = b.examDate ? Math.max(1, Math.ceil((new Date(b.examDate) - new Date()) / 86400000)) : 999;
    const prioA = (a.importance || 3) * 2 + (a.difficulty || 3) + (1000 / daysA) * 3;
    const prioB = (b.importance || 3) * 2 + (b.difficulty || 3) + (1000 / daysB) * 3;
    return prioB - prioA;
  });

  const totalStudyMinutes = Math.round(dailyStudyHours * 60);
  const SESSION_TYPES = ['learn', 'practice', 'revision'];
  const startHours = { 'morning': 7, 'afternoon': 12, 'evening': 16, 'night': 20 };
  const baseHour = startHours[preferredTime] || 7;

  const startDate = new Date();
  const t = todayStr();

  for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + dayOffset);
    const dateStr = formatDateISO(d);

    if (state.sessions[dateStr] && !force) continue;

    const dayOfWeek = d.getDay();
    let dayTargetMinutes = totalStudyMinutes;
    if (dayOfWeek === 6) dayTargetMinutes = Math.round(totalStudyMinutes * 0.75);
    else if (dayOfWeek === 0) dayTargetMinutes = Math.round(totalStudyMinutes * 0.50);

    if (dayTargetMinutes < 30) {
      state.sessions[dateStr] = [];
      continue;
    }

    const rotatedPool = pool.length > 0
      ? [...pool.slice((dayOffset * 2) % pool.length), ...pool.slice(0, (dayOffset * 2) % pool.length)]
      : pool;

    let currentHour = baseHour;
    let currentMinute = 0;
    let remainingMinutes = dayTargetMinutes;
    let sessionIdx = 0;
    const daySessions = [];
    const isPast = dateStr < t;

    while (remainingMinutes > 0 && sessionIdx < rotatedPool.length * 2 && sessionIdx < 8) {
      const item = rotatedPool[sessionIdx % rotatedPool.length];
      let dur = Math.min(remainingMinutes, [60, 90, 45, 60, 75, 45, 60][sessionIdx % 7]);
      if (dur < 25) break;

      const startTimeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

      const totalMin = currentHour * 60 + currentMinute + dur;
      const endHour = Math.floor(totalMin / 60);
      const endMin = totalMin % 60;
      const endTimeStr = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;

      const sessionType = SESSION_TYPES[(dayOffset + sessionIdx) % SESSION_TYPES.length];

      let status = 'scheduled';
      if (isPast) status = 'completed';

      const s = makeSession(
        dateStr,
        startTimeStr,
        item.topicId,
        item.topicName,
        item.subjectId,
        item.subjectName,
        item.subjectColor,
        dur,
        sessionType,
        status
      );

      s.start_time = startTimeStr;
      s.end_time = endTimeStr;
      s.startTime = startTimeStr;
      s.endTime = endTimeStr;
      s.durationMinutes = dur;
      s.sessionType = sessionType;

      daySessions.push(s);

      remainingMinutes -= dur;

      const advance = dur + breakMinutes;
      currentMinute += advance;
      currentHour += Math.floor(currentMinute / 60);
      currentMinute = currentMinute % 60;
      sessionIdx++;
    }

    state.sessions[dateStr] = daySessions;
  }

  saveState();
}

function buildTodaySessions() {
  const pool = _buildStudyPool();
  return _buildDaySessions(todayStr(), pool, new Date().getDay() === 0 ? 6 : new Date().getDay() - 1, false, true);
}

function buildWeekSessions(mondayDate) {
  const base = parseISODate(mondayDate);
  const days = [];
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const t = todayStr();
  const pool = _buildStudyPool();

  for (let i = 0; i < 7; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const dateStr = formatDateISO(d);
    const isPast = dateStr < t;
    const isToday = dateStr === t;

    let sessions;
    if (state.sessions[dateStr]) {
      sessions = state.sessions[dateStr];
    } else {
      // Rotate pool offset so different days get different topics
      const rotatedPool = pool.length > 0
        ? [...pool.slice(i % pool.length), ...pool.slice(0, i % pool.length)]
        : [];

      sessions = _buildDaySessions(dateStr, rotatedPool, i, isPast, isToday);
      state.sessions[dateStr] = sessions;
    }

    const total_hours = parseFloat(
      (sessions.filter(s => s.status !== 'missed').reduce((a, s) => a + s.duration_minutes / 60, 0)).toFixed(1)
    );

    days.push({
      date: dateStr,
      day_name: dayNames[i],
      sessions,
      total_hours,
      planned_hours: parseFloat((sessions.reduce((a, s) => a + s.duration_minutes / 60, 0)).toFixed(1)),
    });
  }

  return { week_start: mondayDate, days };
}

// Memoize week data
export function getWeekData(weekStartStr) {
  // Invalidate cache when subjects change (simple: always rebuild)
  // For demo purposes a simple approach: tag cache with subject count
  const cacheKey = `${weekStartStr}_${state.subjects.length}_${Object.values(state.topics).flat().length}`;
  if (!_weekCache[cacheKey]) {
    _weekCache[cacheKey] = buildWeekSessions(weekStartStr);
  }
  const weekData = _weekCache[cacheKey];
  weekData.days.forEach(d => {
    if (state.sessions[d.date]) {
      d.sessions = state.sessions[d.date];
    }
  });
  return weekData;
}

export function getTodaySessions() {
  const t = todayStr();
  const mon = mondayOfCurrentWeek();
  const weekData = getWeekData(mon);
  const today = weekData.days.find(d => d.date === t);
  return today ? today.sessions : buildTodaySessions();
}

// ── AI CHAT RESPONSES ─────────────────────────────────────────────────────────
const AI_RESPONSES = {
  default: [
    "Based on your current progress, I'd recommend focusing on the topics closest to your exam dates. Prioritize any topics below 50% completion. 📚",
    "Your study strategy should focus on incomplete topics first. Use active recall: close your notes and write everything you remember. 🎯",
    "Consistency is the #1 predictor of exam success. Try to complete at least one session before noon every day. ⚡",
    "I'd recommend scheduling your hardest topics during morning hours when focus is highest. Easier revision can go to afternoon/evening. 🌅",
    "For complex topics, use the Feynman technique: try explaining the concept simply without notes to find hidden knowledge gaps. 🧠",
  ],
  greetings: [
    "Hello! 👋 How can I help you today? I can assist with study strategies, explain concepts, or help plan your revision schedule.",
    "Good to see you! What would you like to work on today?",
  ],
  keywords: {},
};

// Dynamically build keyword responses from state subjects
function _buildKeywordResponses() {
  const kw = {};
  for (const s of state.subjects) {
    const topics = (state.topics[s.id] || []);
    const incomplete = topics.filter(t => t.status !== 'completed');
    const topicNames = incomplete.slice(0, 3).map(t => t.name).join(', ');
    const progress = topics.length > 0
      ? Math.round(topics.reduce((a, t) => a + (t.current_progress || 0), 0) / topics.length)
      : 0;

    const key = s.name.toLowerCase().split(' ')[0]; // first word as keyword
    kw[key] = `**${s.name}** is at ${progress}% overall. ${incomplete.length > 0 ? `Key topics to focus on: **${topicNames}**. ` : 'All topics completed! 🎉 '}${s.days_to_exam ? `Exam in ${s.days_to_exam} days.` : ''} Keep up the momentum! 💪`;
  }
  kw['streak'] = "Consistency is everything! Students who maintain a 14+ day study streak score up to 28% higher on semester exams. Keep pushing your momentum! 🔥";
  kw['plan'] = "Your AI study plan is optimally structured! It ensures you cover all topics at least twice before each exam. Any adjustments needed?";
  kw['tip'] = "📚 **Top 3 Study Tips:**\n\n1. **Spaced Repetition** — Review after 1, 3, 7, and 14 days\n2. **Active Recall** — Close your notes and write everything you remember\n3. **Interleaved Practice** — Mix topics from different subjects";
  kw['exam'] = (() => {
    const exams = state.subjects.filter(s => s.days_to_exam != null).sort((a, b) => a.days_to_exam - b.days_to_exam);
    if (exams.length === 0) return "You haven't added any exam dates yet. Head to **Subjects** to add your exam dates so the AI can optimize your schedule!";
    const list = exams.map(s => `**${s.name}** (${s.days_to_exam}d)`).join(' → ');
    return `Exam countdown: ${list}. Focus efforts on the nearest exams first! ⏰`;
  })();
  return kw;
}

let _responseIndex = 0;
export function getAIResponse(message) {
  const lower = message.toLowerCase();

  if (/^(hi|hello|hey|good morning|good evening|howdy)/i.test(lower)) {
    return AI_RESPONSES.greetings[Math.floor(Math.random() * AI_RESPONSES.greetings.length)];
  }

  const keywords = _buildKeywordResponses();
  for (const [key, response] of Object.entries(keywords)) {
    if (lower.includes(key)) return response;
  }

  const resp = AI_RESPONSES.default[_responseIndex % AI_RESPONSES.default.length];
  _responseIndex++;
  return resp;
}

// ── HELPER: get sessions for date (used by api.js) ───────────────────────────
export function getSessionsForDate(dateStr) {
  if (state.sessions[dateStr]) return state.sessions[dateStr];
  const mon = getMondayOf(dateStr);
  const weekData = getWeekData(mon);
  weekData.days.forEach(d => {
    if (!state.sessions[d.date]) {
      state.sessions[d.date] = d.sessions;
    }
  });
  return state.sessions[dateStr] || [];
}

function getMondayOf(dateStr) {
  const d = parseISODate(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return formatDateISO(d);
}

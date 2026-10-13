/**
 * timetable.js — Generated Timetable page logic
 * Shows AI-generated study sessions with completion tracking, progress bar, persistence
 */
import { initTheme, requireAuth, toast, formatTime, todayISO, confirmDialog } from '../js/app.js';
import api, { getUser } from '../js/api.js';
import { state, saveState, generateAISchedule } from '../js/demoData.js';

initTheme();

// ── STORAGE KEYS ──────────────────────────────────────────────────────────────
const TT_KEY_PREFIX = 'sp_timetable_';
const TT_COMPLETION_PREFIX = 'sp_tt_completion_';

function getActiveUserId() {
  try {
    const u = getUser();
    return u?.id || 'demo-user-001';
  } catch { return 'demo-user-001'; }
}

function ttStorageKey(dateStr) {
  return `${TT_KEY_PREFIX}${getActiveUserId()}_${dateStr}`;
}

function completionStorageKey(dateStr) {
  return `${TT_COMPLETION_PREFIX}${getActiveUserId()}_${dateStr}`;
}

// ── FINGERPRINT — detect when subjects/topics have changed ────────────────────
function computeStateFingerprint() {
  try {
    const subjectIds = state.subjects.map(s => s.id).sort().join(',');
    const topicIds = Object.values(state.topics).flat().map(t => t.id).sort().join(',');
    const topicCount = Object.values(state.topics).flat().length;
    return `${state.subjects.length}:${topicCount}:${subjectIds}:${topicIds}`;
  } catch { return ''; }
}

// ── SAVE / LOAD TIMETABLE ─────────────────────────────────────────────────────
function saveTimetable(dateStr, timetable) {
  try {
    timetable._stateFingerprint = computeStateFingerprint();
    localStorage.setItem(ttStorageKey(dateStr), JSON.stringify(timetable));
  } catch (e) { console.error('Failed to save timetable:', e); }
}

function loadTimetable(dateStr) {
  try {
    const raw = localStorage.getItem(ttStorageKey(dateStr));
    if (!raw) return null;
    const timetable = JSON.parse(raw);
    // Invalidate cache if subjects/topics have changed since timetable was generated
    const currentFingerprint = computeStateFingerprint();
    if (!timetable._stateFingerprint || timetable._stateFingerprint !== currentFingerprint) {
      console.log('[Timetable] State changed since last generation, invalidating cache');
      localStorage.removeItem(ttStorageKey(dateStr));
      return null;
    }
    return timetable;
  } catch { return null; }
}

function saveCompletionStatus(dateStr, completions) {
  try {
    localStorage.setItem(completionStorageKey(dateStr), JSON.stringify(completions));
  } catch (e) { console.error('Failed to save completion:', e); }
}

function loadCompletionStatus(dateStr) {
  try {
    const raw = localStorage.getItem(completionStorageKey(dateStr));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ── AI STUDY TIPS ─────────────────────────────────────────────────────────────
const STUDY_TIPS = [
  'Focus on understanding the core concepts before moving to practice problems.',
  'Use active recall: close your notes and try to explain the concept out loud.',
  'Take brief notes using the Cornell method for better retention.',
  'Try solving problems without looking at solutions first.',
  'Connect this topic to real-world applications for deeper understanding.',
  'Break complex concepts into smaller sub-topics for easier digestion.',
  'Teach this topic to someone else — it\'s the best way to learn.',
  'Create mind maps to visualize relationships between concepts.',
  'Practice with past exam papers for this topic.',
  'Use spaced repetition — review this topic again in 2-3 days.',
  'Start with easier examples, then progressively tackle harder ones.',
  'Write summary flashcards after completing this session.',
];

function getStudyTip(topicName, subjectName, index) {
  const seed = (topicName.length + subjectName.length + index) % STUDY_TIPS.length;
  return STUDY_TIPS[seed];
}

// ── INTELLIGENT TIMETABLE GENERATOR ───────────────────────────────────────────
function generateTimetable(dateStr) {
  const user = getUser() || {};
  const prefs = user.preferences || {};
  const dailyStudyHours = parseFloat(prefs.daily_study_hours) || 4;
  const preferredTime = prefs.preferred_study_time || 'morning';
  const breakMinutes = parseInt(prefs.break_duration_minutes) || 15;
  const totalStudyMinutes = Math.round(dailyStudyHours * 60);

  if (state.sessions[dateStr] && state.sessions[dateStr].length > 0) {
    const rawSessions = state.sessions[dateStr];
    const formattedSessions = rawSessions.map((s, idx) => ({
      id: s.id,
      sessionNumber: idx + 1,
      startTime: s.start_time || s.startTime || '07:00',
      endTime: s.end_time || s.endTime || '08:00',
      durationMinutes: s.duration_minutes || s.durationMinutes || 60,
      topicId: s.topic_id || s.topicId,
      topicName: s.topic_name || s.topicName,
      subjectId: s.subject_id || s.subjectId,
      subjectName: s.subject_name || s.subjectName,
      subjectColor: s.subject_color || s.subjectColor || '#00f5a0',
      sessionType: s.session_type || s.sessionType || 'learn',
      status: s.status || 'scheduled',
    }));
    return {
      date: dateStr,
      sessions: formattedSessions,
      totalStudyHours: dailyStudyHours,
      dailyStudyHours,
      actualStudyMinutes: formattedSessions.reduce((acc, s) => acc + s.durationMinutes, 0),
    };
  }

  // Build study pool from state
  const pool = [];
  for (const subj of state.subjects) {
    const topics = state.topics[subj.id] || [];
    for (const t of topics) {
      if (t.status === 'completed') continue;
      const daysToExam = subj.exam_date ? Math.max(1, Math.ceil((new Date(subj.exam_date) - new Date()) / 86400000)) : 999;
      const priorityScore =
        (t.importance || 3) * 2.0 +
        (t.difficulty || 3) * 1.0 +
        (1000 / daysToExam) * 3.0 -
        ((t.current_progress || 0) / 100) * 2.0;

      pool.push({
        topicId: t.id,
        topicName: t.name,
        subjectId: subj.id,
        subjectName: subj.name,
        subjectColor: subj.color || '#00f5a0',
        difficulty: t.difficulty || 3,
        importance: t.importance || 3,
        progress: t.current_progress || 0,
        estimatedHours: t.estimated_hours || 2,
        examDate: subj.exam_date || null,
        daysToExam,
        priorityScore,
      });
    }
  }

  // If no incomplete topics, include all topics
  if (pool.length === 0) {
    for (const subj of state.subjects) {
      const topics = state.topics[subj.id] || [];
      for (const t of topics) {
        const daysToExam = subj.exam_date ? Math.max(1, Math.ceil((new Date(subj.exam_date) - new Date()) / 86400000)) : 999;
        pool.push({
          topicId: t.id,
          topicName: t.name,
          subjectId: subj.id,
          subjectName: subj.name,
          subjectColor: subj.color || '#00f5a0',
          difficulty: t.difficulty || 3,
          importance: t.importance || 3,
          progress: t.current_progress || 0,
          estimatedHours: t.estimated_hours || 2,
          examDate: subj.exam_date || null,
          daysToExam,
          priorityScore: (t.importance || 3) * 2.0 + (t.difficulty || 3) * 1.0,
        });
      }
    }
  }

  if (pool.length === 0) {
    return { date: dateStr, sessions: [], totalStudyHours: dailyStudyHours, dailyStudyHours };
  }

  // Sort by priority (higher = more urgent)
  pool.sort((a, b) => b.priorityScore - a.priorityScore);

  // Determine start time based on preference
  const startHours = {
    'morning': 7,
    'afternoon': 12,
    'evening': 16,
    'night': 20,
  };
  let currentHour = startHours[preferredTime] || 7;
  let currentMinute = 0;

  // Determine session durations — distribute study time among subjects
  // Strategy: Assign time proportional to priority, minimum 30 min per session
  const uniqueSubjects = [...new Map(pool.map(item => [item.subjectId, item])).values()];
  const totalPriority = pool.reduce((sum, item) => sum + item.priorityScore, 0);

  // Build sessions
  const sessions = [];
  let remainingMinutes = totalStudyMinutes;
  let sessionId = 1;

  // Group by subject to distribute evenly
  const subjectGroups = {};
  for (const item of pool) {
    if (!subjectGroups[item.subjectId]) subjectGroups[item.subjectId] = [];
    subjectGroups[item.subjectId].push(item);
  }

  // Calculate time per subject proportional to priority
  const subjectIds = Object.keys(subjectGroups);
  const subjectAllocations = {};
  let totalWeight = 0;

  for (const sid of subjectIds) {
    const items = subjectGroups[sid];
    const weight = items.reduce((sum, item) => sum + item.priorityScore, 0);
    subjectAllocations[sid] = { weight, items };
    totalWeight += weight;
  }

  // Build a session list with allocated time
  const sessionList = [];
  for (const sid of subjectIds) {
    const alloc = subjectAllocations[sid];
    let allocMinutes = Math.round((alloc.weight / totalWeight) * totalStudyMinutes);
    allocMinutes = Math.max(30, allocMinutes); // Minimum 30 minutes per subject

    // Pick the best topic from this subject
    const topic = alloc.items[0]; // Highest priority topic for this subject

    sessionList.push({
      ...topic,
      allocMinutes,
    });
  }

  // Normalize allocations to fit totalStudyMinutes
  const totalAllocated = sessionList.reduce((sum, s) => sum + s.allocMinutes, 0);
  if (totalAllocated !== totalStudyMinutes && sessionList.length > 0) {
    const scale = totalStudyMinutes / totalAllocated;
    let remainder = totalStudyMinutes;
    for (let i = 0; i < sessionList.length; i++) {
      if (i === sessionList.length - 1) {
        sessionList[i].allocMinutes = Math.max(30, remainder);
      } else {
        sessionList[i].allocMinutes = Math.max(30, Math.round(sessionList[i].allocMinutes * scale));
        remainder -= sessionList[i].allocMinutes;
      }
    }
  }

  // Split long sessions (> 90 min) into smaller chunks
  const finalSessions = [];
  for (const s of sessionList) {
    let remaining = s.allocMinutes;
    let subIdx = 0;
    while (remaining > 0) {
      const duration = Math.min(remaining, 90); // Max 90 minutes per session
      if (duration < 20) break; // Skip tiny sessions
      const topicItem = s.allocMinutes > 90 && subIdx > 0 && subjectGroups[s.subjectId].length > 1
        ? subjectGroups[s.subjectId][Math.min(subIdx, subjectGroups[s.subjectId].length - 1)]
        : s;
      finalSessions.push({
        ...topicItem,
        duration,
      });
      remaining -= duration;
      subIdx++;
    }
  }

  // Sort final sessions by priority (to put highest priority first in the day)
  finalSessions.sort((a, b) => b.priorityScore - a.priorityScore);

  // Assign times
  for (let i = 0; i < finalSessions.length; i++) {
    const s = finalSessions[i];
    const startTime = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;

    // Calculate end time
    let endMinutes = currentMinute + s.duration;
    let endHour = currentHour + Math.floor(endMinutes / 60);
    endMinutes = endMinutes % 60;
    if (endHour >= 24) endHour -= 24;
    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`;

    const sessionTypes = ['learning', 'practice', 'revision'];
    const tip = getStudyTip(s.topicName, s.subjectName, i);

    sessions.push({
      id: `tt-${dateStr}-${sessionId}`,
      sessionNumber: sessionId,
      date: dateStr,
      startTime,
      endTime,
      durationMinutes: s.duration,
      topicId: s.topicId,
      topicName: s.topicName,
      subjectId: s.subjectId,
      subjectName: s.subjectName,
      subjectColor: s.subjectColor,
      sessionType: sessionTypes[i % sessionTypes.length],
      difficulty: s.difficulty,
      importance: s.importance,
      daysToExam: s.daysToExam,
      studyTip: tip,
    });

    sessionId++;

    // Add break after this session (advance clock)
    const totalSessionBreak = s.duration + breakMinutes;
    currentMinute += totalSessionBreak;
    currentHour += Math.floor(currentMinute / 60);
    currentMinute = currentMinute % 60;

    // If we're going too late into the night, skip lunch break / long gap
    if (currentHour >= 12 && currentHour < 14 && preferredTime === 'morning') {
      currentHour = 14;
      currentMinute = 0;
    }
  }

  const actualTotalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);

  return {
    date: dateStr,
    sessions,
    totalStudyHours: dailyStudyHours,
    actualStudyMinutes: actualTotalMinutes,
    totalSessions: sessions.length,
    generatedAt: new Date().toISOString(),
    dailyStudyHours,
  };
}

// ── RENDER TIMETABLE ──────────────────────────────────────────────────────────
function renderTimetable() {
  const today = todayISO();
  let timetable = loadTimetable(today);

  // Generate if not exists, or if cached timetable has no sessions but we now have subjects
  if (!timetable || !timetable.sessions || (timetable.sessions.length === 0 && state.subjects.length > 0)) {
    timetable = generateTimetable(today);
    saveTimetable(today, timetable);
  }

  const completions = loadCompletionStatus(today);
  const sessions = timetable.sessions || [];

  // ── Header
  const dateEl = document.getElementById('tt-date');
  const titleEl = document.getElementById('tt-title');
  const subtitleEl = document.getElementById('tt-subtitle');
  const statsEl = document.getElementById('tt-stats');

  const d = new Date(today + 'T00:00:00');
  const dateStr = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (dateEl) dateEl.textContent = `📅 ${dateStr}`;
  if (titleEl) titleEl.textContent = '🤖 Your AI Generated Study Timetable';

  const completedCount = sessions.filter(s => completions[s.id]).length;
  const totalHours = timetable.dailyStudyHours || (timetable.actualStudyMinutes / 60);
  const completedMinutes = sessions.filter(s => completions[s.id]).reduce((sum, s) => sum + s.durationMinutes, 0);
  const completedHours = (completedMinutes / 60).toFixed(1);

  if (subtitleEl) {
    subtitleEl.textContent = `Today's AI Study Plan • ${sessions.length > 0 ? sessions.length + ' Sessions' : 'No sessions'}`;
  }

  if (statsEl) {
    statsEl.innerHTML = `
      <div class="tt-stat">
        <span class="tt-stat-icon">⏰</span>
        <div>
          <div class="tt-stat-value">${totalHours}h</div>
          <div class="tt-stat-label">Total Study</div>
        </div>
      </div>
      <div class="tt-stat">
        <span class="tt-stat-icon">📚</span>
        <div>
          <div class="tt-stat-value">${sessions.length}</div>
          <div class="tt-stat-label">Sessions</div>
        </div>
      </div>
      <div class="tt-stat">
        <span class="tt-stat-icon">✅</span>
        <div>
          <div class="tt-stat-value">${completedCount}/${sessions.length}</div>
          <div class="tt-stat-label">Completed</div>
        </div>
      </div>
      <div class="tt-stat">
        <span class="tt-stat-icon">🔥</span>
        <div>
          <div class="tt-stat-value">${sessions.length > 0 ? Math.round((completedCount / sessions.length) * 100) : 0}%</div>
          <div class="tt-stat-label">Progress</div>
        </div>
      </div>
    `;
  }

  // ── Progress
  updateProgress(sessions, completions);

  // ── Sessions
  const container = document.getElementById('tt-sessions');
  if (!container) return;

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="tt-empty">
        <div class="tt-empty-icon">📅</div>
        <div class="tt-empty-title">No Study Sessions</div>
        <div class="tt-empty-text">You need to add subjects and topics first, then generate your timetable.</div>
        <a href="../onboarding/index.html" class="btn btn-primary">🚀 Set Up Your Plan</a>
      </div>
    `;
    return;
  }

  container.innerHTML = '';
  sessions.forEach((session, index) => {
    const isCompleted = !!completions[session.id];

    // Add break indicator between sessions (except before first)
    if (index > 0) {
      const prevSession = sessions[index - 1];
      const breakEl = document.createElement('div');
      breakEl.className = 'tt-break';
      // Calculate break duration from previous session end to this session start
      const prevEnd = parseTimeToMinutes(prevSession.endTime);
      const thisStart = parseTimeToMinutes(session.startTime);
      const breakDur = thisStart - prevEnd;
      breakEl.innerHTML = `
        <div class="tt-break-line"></div>
        <span class="tt-break-label">☕ ${breakDur > 0 ? breakDur + ' min break' : 'Break'}</span>
        <div class="tt-break-line"></div>
      `;
      container.appendChild(breakEl);
    }

    const card = document.createElement('div');
    card.className = `tt-session-card animate-fade-up ${isCompleted ? 'tt-completed' : ''}`;
    card.style.animationDelay = `${index * 60}ms`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('data-session-id', session.id);

    const formattedStart = formatTime(session.startTime);
    const formattedEnd = formatTime(session.endTime);
    const durHours = Math.floor(session.durationMinutes / 60);
    const durMins = session.durationMinutes % 60;
    const durLabel = durHours > 0
      ? `${durHours}h ${durMins > 0 ? durMins + 'm' : ''}`
      : `${durMins} min`;

    card.innerHTML = `
      <div class="tt-session-num">${isCompleted ? '✓' : session.sessionNumber}</div>
      <div class="tt-time-block">
        <div class="tt-time-range">${formattedStart}<br>— ${formattedEnd}</div>
        <div class="tt-duration-badge">⏱ ${durLabel}</div>
      </div>
      <div class="tt-color-bar" style="background:${session.subjectColor}" aria-hidden="true"></div>
      <div class="tt-session-info">
        <div class="tt-session-topic">${session.topicName}</div>
        <div class="tt-session-subject">${session.subjectName}</div>
        <div class="tt-session-tip">💡 ${session.studyTip}</div>
      </div>
      <div class="tt-check-area">
        <input type="checkbox" class="tt-checkbox" id="check-${session.id}"
          ${isCompleted ? 'checked' : ''}
          aria-label="Mark ${session.topicName} as completed">
        <label class="tt-check-label" for="check-${session.id}">${isCompleted ? 'Done!' : 'Mark Done'}</label>
      </div>
    `;

    // Completion handler
    const checkbox = card.querySelector('.tt-checkbox');
    checkbox.addEventListener('change', () => {
      const currentCompletions = loadCompletionStatus(today);
      if (checkbox.checked) {
        currentCompletions[session.id] = {
          completedAt: new Date().toISOString(),
          durationMinutes: session.durationMinutes,
        };
        card.classList.add('tt-completed');
        card.querySelector('.tt-check-label').textContent = 'Done!';
        card.querySelector('.tt-session-num').textContent = '✓';
        toast.success('✅ Session Completed!', `${session.topicName} — Great work!`);
      } else {
        delete currentCompletions[session.id];
        card.classList.remove('tt-completed');
        card.querySelector('.tt-check-label').textContent = 'Mark Done';
        card.querySelector('.tt-session-num').textContent = session.sessionNumber;
      }
      saveCompletionStatus(today, currentCompletions);
      updateProgress(sessions, currentCompletions);
      updateStatsDisplay(sessions, currentCompletions);
    });

    container.appendChild(card);
  });
}

function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function updateProgress(sessions, completions) {
  const total = sessions.length;
  const completed = sessions.filter(s => !!completions[s.id]).length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const completedMinutes = sessions.filter(s => !!completions[s.id]).reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const completedHours = (completedMinutes / 60).toFixed(1);
  const totalHours = (totalMinutes / 60).toFixed(1);

  const pctEl = document.getElementById('tt-pct');
  const fillEl = document.getElementById('tt-progress-fill');
  const sessionsEl = document.getElementById('tt-sessions-done');
  const hoursEl = document.getElementById('tt-hours-done');

  if (pctEl) pctEl.textContent = `${pct}%`;
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (sessionsEl) sessionsEl.textContent = `${completed} / ${total} Sessions Completed`;
  if (hoursEl) hoursEl.textContent = `${completedHours}h / ${totalHours}h Studied`;
}

function updateStatsDisplay(sessions, completions) {
  const statsEl = document.getElementById('tt-stats');
  if (!statsEl) return;

  const completed = sessions.filter(s => !!completions[s.id]).length;
  const totalMinutes = sessions.reduce((sum, s) => sum + s.durationMinutes, 0);
  const totalHours = (totalMinutes / 60).toFixed(1);
  const pct = sessions.length > 0 ? Math.round((completed / sessions.length) * 100) : 0;

  statsEl.innerHTML = `
    <div class="tt-stat">
      <span class="tt-stat-icon">⏰</span>
      <div>
        <div class="tt-stat-value">${totalHours}h</div>
        <div class="tt-stat-label">Total Study</div>
      </div>
    </div>
    <div class="tt-stat">
      <span class="tt-stat-icon">📚</span>
      <div>
        <div class="tt-stat-value">${sessions.length}</div>
        <div class="tt-stat-label">Sessions</div>
      </div>
    </div>
    <div class="tt-stat">
      <span class="tt-stat-icon">✅</span>
      <div>
        <div class="tt-stat-value">${completed}/${sessions.length}</div>
        <div class="tt-stat-label">Completed</div>
      </div>
    </div>
    <div class="tt-stat">
      <span class="tt-stat-icon">🔥</span>
      <div>
        <div class="tt-stat-value">${pct}%</div>
        <div class="tt-stat-label">Progress</div>
      </div>
    </div>
  `;
}

// ── REGENERATE ────────────────────────────────────────────────────────────────
function showRegenModal() {
  const modal = document.getElementById('regen-modal');
  if (modal) modal.classList.remove('hidden');
}

function hideRegenModal() {
  const modal = document.getElementById('regen-modal');
  if (modal) modal.classList.add('hidden');
}

function regenerateTimetable() {
  const today = todayISO();
  // Clear existing data
  localStorage.removeItem(ttStorageKey(today));
  localStorage.removeItem(completionStorageKey(today));

  // Force fresh AI schedule generation across state
  generateAISchedule(true);

  try {
    renderTimetable();
    toast.success('🔄 Timetable Regenerated!', 'Your new AI study plan is ready.');
  } catch (e) {
    console.error('[Timetable] Regeneration error:', e);
    toast.error('Error', 'Failed to regenerate timetable. Please try again.');
  }
  hideRegenModal();
}

// ── EVENT LISTENERS ───────────────────────────────────────────────────────────
document.getElementById('regen-btn')?.addEventListener('click', showRegenModal);
document.getElementById('regen-btn-bottom')?.addEventListener('click', showRegenModal);
document.getElementById('close-regen-modal')?.addEventListener('click', hideRegenModal);
document.getElementById('cancel-regen')?.addEventListener('click', hideRegenModal);
document.getElementById('confirm-regen')?.addEventListener('click', regenerateTimetable);

document.getElementById('edit-schedule-btn')?.addEventListener('click', () => {
  window.location.href = '../onboarding/index.html';
});

// Close modal on overlay click
document.getElementById('regen-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'regen-modal') hideRegenModal();
});

// ── SIDEBAR TOGGLE ────────────────────────────────────────────────────────────
const sidebar = document.querySelector('.sidebar');
const hamburger = document.querySelector('#sidebar-toggle');
hamburger?.addEventListener('click', () => sidebar?.classList.toggle('open'));
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 1024 && sidebar?.classList.contains('open')) {
    if (!sidebar.contains(e.target) && !hamburger?.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  }
});

// Logout
document.querySelectorAll('[data-logout]').forEach(btn => {
  btn.addEventListener('click', () => {
    const { clearToken } = api;
    localStorage.removeItem('sp_token');
    localStorage.removeItem('sp_user');
    window.location.href = '../auth/login.html';
  });
});

// ── INIT ──────────────────────────────────────────────────────────────────────
try {
  if (requireAuth()) {
    renderTimetable();
  }
} catch (e) {
  console.error('[Timetable] Init error:', e);
  const container = document.getElementById('tt-sessions');
  if (container) {
    container.innerHTML = `
      <div class="tt-empty">
        <div class="tt-empty-icon">⚠️</div>
        <div class="tt-empty-title">Something went wrong</div>
        <div class="tt-empty-text">Failed to load your timetable. Try regenerating it.</div>
        <button class="btn btn-primary" onclick="location.reload()">🔄 Reload Page</button>
      </div>
    `;
  }
}

/**
 * planner.js — Planner page: daily, weekly, exam prep views
 */
import { initTheme, requireAuth, toast, formatTime, todayISO, daysUntil, sessionChip, statusBadge, confirmDialog } from '../js/app.js';
import api from '../js/api.js';

initTheme();
requireAuth();

let currentDate = todayISO();
let currentWeekStart = getWeekStart(new Date());
let currentView = 'daily';

// ── TABS ──────────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    currentView = btn.dataset.view;
    ['daily','weekly','exam'].forEach(v => document.getElementById(`view-${v}`).classList.add('hidden'));
    document.getElementById(`view-${currentView}`).classList.remove('hidden');
    loadCurrentView();
  });
});

function loadCurrentView() {
  if (currentView === 'daily') loadDaily(currentDate);
  else if (currentView === 'weekly') loadWeekly(currentWeekStart);
  else loadExamPrep();
}

// ── LOAD PLAN STATUS ──────────────────────────────────────────
async function loadPlanStatus() {
  try {
    const status = await api.getPlanStatus();
    if (status.has_plan && status.ai_explanation) {
      const banner = document.getElementById('ai-explanation');
      const text = document.getElementById('ai-explanation-text');
      banner.classList.remove('hidden');
      if (text) text.textContent = status.ai_explanation;
    }
  } catch {}
}

// ── DAILY VIEW ────────────────────────────────────────────────
async function loadDaily(dateStr) {
  const container = document.getElementById('daily-sessions');
  const dateEl = document.getElementById('daily-date');

  const d = new Date(dateStr + 'T00:00:00');
  const isToday = dateStr === todayISO();
  if (dateEl) dateEl.textContent = isToday ? 'Today · ' + d.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' })
    : d.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  container.innerHTML = '<div class="skeleton skeleton-card" style="height:80px;margin-bottom:12px"></div><div class="skeleton skeleton-card" style="height:80px"></div>';

  try {
    const timetable = await api.getTimetable(dateStr);
    const sessions = timetable?.sessions || [];

    if (!sessions.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">No sessions on this day</div><div class="empty-state-text">${isToday ? 'Generate your AI plan to get started.' : 'No study sessions scheduled.'}</div>${isToday ? '<button class="btn btn-primary mt-4" onclick="generatePlan()">🤖 Generate Plan</button>' : ''}</div>`;
      return;
    }

    container.innerHTML = '';
    sessions.forEach((s, i) => {
      const card = document.createElement('div');
      card.className = 'daily-session-card animate-fade-up';
      card.style.animationDelay = `${i * 50}ms`;
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', `${s.topic_name} session`);
      card.innerHTML = `
        <div class="time-block">
          <div class="time-start">${formatTime(s.start_time)}</div>
          <div class="time-dur">${s.duration_minutes}min</div>
        </div>
        <div style="width:4px;height:50px;background:${s.subject_color};border-radius:var(--radius-full);flex-shrink:0" aria-hidden="true"></div>
        <div style="flex:1;min-width:0">
          <div class="font-semibold text-sm truncate" style="color:var(--text-primary)">${s.topic_name}</div>
          <div class="text-xs text-muted">${s.subject_name}</div>
          <div class="flex gap-2 mt-1 flex-wrap">${sessionChip(s.session_type)} ${statusBadge(s.status)}</div>
        </div>
        <div class="flex gap-2" role="group" aria-label="Session actions">
          ${s.status === 'scheduled' ? `
            <a href="../focus/index.html?session=${s.id}" class="btn btn-primary btn-sm" aria-label="Start session">▶ Start</a>
            <button class="btn btn-success btn-sm complete-btn" data-id="${s.id}" aria-label="Mark complete">✓</button>
            <button class="btn btn-ghost btn-sm skip-btn" data-id="${s.id}" aria-label="Skip">Skip</button>
            <button class="btn btn-secondary btn-sm reschedule-btn" data-id="${s.id}" aria-label="Reschedule">📅</button>
          ` : ''}
        </div>
      `;
      container.appendChild(card);
    });

    setupSessionHandlers(container);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-text">Failed to load sessions. <button class="btn btn-secondary btn-sm" onclick="loadDaily('${dateStr}')">Retry</button></div></div>`;
  }
}

function setupSessionHandlers(container) {
  container.addEventListener('click', async e => {
    const completeBtn = e.target.closest('.complete-btn');
    const skipBtn = e.target.closest('.skip-btn');
    const rescheduleBtn = e.target.closest('.reschedule-btn');

    if (completeBtn) {
      const id = completeBtn.dataset.id;
      completeBtn.disabled = true;
      try { await api.completeSession(id); toast.success('✅ Completed!', 'Great work!'); loadDaily(currentDate); }
      catch (err) { toast.error('Error', err.message); completeBtn.disabled = false; }
    }
    if (skipBtn) {
      const id = skipBtn.dataset.id;
      try { await api.skipSession(id); toast.info('Skipped', 'Session marked as skipped.'); loadDaily(currentDate); }
      catch (err) { toast.error('Error', err.message); }
    }
    if (rescheduleBtn) {
      openRescheduleModal(rescheduleBtn.dataset.id);
    }
  });
}

// Day navigation
document.getElementById('prev-day')?.addEventListener('click', () => {
  const d = new Date(currentDate);
  d.setDate(d.getDate() - 1);
  currentDate = d.toISOString().split('T')[0];
  loadDaily(currentDate);
});
document.getElementById('next-day')?.addEventListener('click', () => {
  const d = new Date(currentDate);
  d.setDate(d.getDate() + 1);
  currentDate = d.toISOString().split('T')[0];
  loadDaily(currentDate);
});
document.getElementById('today-btn')?.addEventListener('click', () => {
  currentDate = todayISO();
  loadDaily(currentDate);
});

// ── WEEKLY VIEW ───────────────────────────────────────────────
async function loadWeekly(weekStart) {
  const grid = document.getElementById('weekly-grid');
  const label = document.getElementById('week-label');
  grid.innerHTML = '';

  try {
    const data = await api.getWeekly(weekStart.toISOString().split('T')[0]);
    if (label) label.textContent = `Week of ${weekStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`;

    data.days.forEach(day => {
      const isToday = day.date === todayISO();
      const col = document.createElement('div');
      col.className = 'day-col';
      col.setAttribute('role', 'gridcell');
      col.setAttribute('aria-label', `${day.day_name}: ${day.sessions.length} sessions`);
      col.innerHTML = `
        <div class="day-header ${isToday ? 'today' : ''}">${day.day_name.slice(0,3)}<br><span style="font-size:var(--text-xs);font-weight:400;color:var(--text-muted)">${day.date.slice(5)}</span></div>
        ${day.sessions.length ? day.sessions.map(s => `
          <div class="session-pill" style="border-left-color:${s.subject_color}" title="${s.topic_name} · ${formatTime(s.start_time)}" role="listitem">
            <div class="truncate font-medium" style="color:var(--text-primary)">${s.topic_name}</div>
            <div style="font-size:10px;color:var(--text-muted)">${formatTime(s.start_time)} · ${s.duration_minutes}m</div>
          </div>
        `).join('') : '<div style="color:var(--text-muted);font-size:var(--text-xs);text-align:center;padding:var(--space-4)">Rest / No sessions</div>'}
        ${day.total_hours > 0 ? `<div style="font-size:var(--text-xs);color:var(--primary-light);text-align:center;font-weight:600;margin-top:4px">${day.total_hours}h total</div>` : ''}
      `;
      grid.appendChild(col);
    });
  } catch (err) {
    grid.innerHTML = `<div class="col-span-7 empty-state"><div class="empty-state-text">Failed to load weekly plan. <button class="btn btn-secondary btn-sm" onclick="loadWeekly(currentWeekStart)">Retry</button></div></div>`;
  }
}

document.getElementById('prev-week')?.addEventListener('click', () => {
  currentWeekStart.setDate(currentWeekStart.getDate() - 7);
  loadWeekly(currentWeekStart);
});
document.getElementById('next-week')?.addEventListener('click', () => {
  currentWeekStart.setDate(currentWeekStart.getDate() + 7);
  loadWeekly(currentWeekStart);
});

// ── EXAM PREP ─────────────────────────────────────────────────
async function loadExamPrep() {
  const container = document.getElementById('exam-prep-content');
  try {
    const data = await api.getExamPrep();
    const exams = data?.upcoming_exams || [];
    if (!exams.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🎓</div><div class="empty-state-title">No upcoming exams</div><div class="empty-state-text">Add exam dates to subjects to see exam prep status.</div></div>';
      return;
    }
    container.innerHTML = exams.map(e => `
      <div class="card mb-4" role="listitem">
        <div class="flex items-center gap-4 mb-4">
          <div style="width:16px;height:48px;background:${e.subject_color};border-radius:var(--radius-full)" aria-hidden="true"></div>
          <div style="flex:1">
            <div class="font-bold text-lg" style="color:var(--text-primary)">${e.subject_name}</div>
            <div class="text-sm text-muted">Exam: ${e.exam_date}</div>
          </div>
          <div class="text-center">
            <div style="font-family:'Outfit',sans-serif;font-size:var(--text-3xl);font-weight:900;color:${e.days_left <= 3 ? 'var(--danger)' : e.days_left <= 7 ? 'var(--warning)' : 'var(--success)'}">${e.days_left}</div>
            <div class="text-xs text-muted">days left</div>
          </div>
        </div>
        <div class="flex justify-between text-sm mb-2">
          <span class="text-secondary">Readiness</span>
          <span class="font-semibold" style="color:var(--text-primary)">${e.readiness_percent}%</span>
        </div>
        <div class="progress-bar" role="progressbar" aria-valuenow="${e.readiness_percent}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-fill" style="width:${e.readiness_percent}%;background:${e.subject_color}"></div>
        </div>
        <div class="text-xs text-muted mt-2">${e.completed_topics}/${e.total_topics} topics completed</div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><div class="empty-state-text">Failed to load exam data.</div></div>';
  }
}

// ── RESCHEDULE MODAL ──────────────────────────────────────────
function openRescheduleModal(sessionId) {
  document.getElementById('reschedule-session-id').value = sessionId;
  document.getElementById('new-date').value = todayISO();
  document.getElementById('new-time').value = '09:00';
  document.getElementById('reschedule-modal').classList.remove('hidden');
}

document.getElementById('close-reschedule')?.addEventListener('click', () => document.getElementById('reschedule-modal').classList.add('hidden'));
document.getElementById('cancel-reschedule')?.addEventListener('click', () => document.getElementById('reschedule-modal').classList.add('hidden'));

document.getElementById('confirm-reschedule')?.addEventListener('click', async () => {
  const id = document.getElementById('reschedule-session-id').value;
  const date = document.getElementById('new-date').value;
  const time = document.getElementById('new-time').value;
  if (!date || !time) return;
  try {
    await api.rescheduleSession(id, { new_date: date, new_start_time: time });
    document.getElementById('reschedule-modal').classList.add('hidden');
    toast.success('✅ Rescheduled!', 'Session moved to new time.');
    loadDaily(currentDate);
  } catch (err) { toast.error('Failed', err.message); }
});

// ── GLOBAL ACTIONS ────────────────────────────────────────────
document.getElementById('regen-btn')?.addEventListener('click', () => {
  confirmDialog('Regenerate AI Plan?', 'This replaces all future scheduled sessions with a fresh AI plan.', async () => {
    try {
      toast.info('Generating...', 'Creating your new plan...');
      await api.generatePlan(true);
      toast.success('✅ New plan ready!', 'Your schedule has been regenerated.');
      loadCurrentView();
    } catch (err) { toast.error('Failed', err.message); }
  });
});

document.getElementById('redistribute-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('redistribute-btn');
  btn.disabled = true;
  try {
    const r = await api.redistributeMissed();
    toast.success('✅ Synced!', `${r.redistributed} sessions redistributed.`);
    loadCurrentView();
  } catch (err) { toast.error('Failed', err.message); }
  finally { btn.disabled = false; }
});

window.generatePlan = async () => {
  try { await api.generatePlan(false); toast.success('Plan ready!', ''); loadCurrentView(); }
  catch (err) { toast.error('Failed', err.message); }
};

function getWeekStart(d) {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Init
if (requireAuth()) {
  loadPlanStatus();
  loadCurrentView();
}

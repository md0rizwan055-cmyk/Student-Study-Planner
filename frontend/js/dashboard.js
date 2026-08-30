/**
 * dashboard.js — Dashboard data loading and rendering
 */

import { initTheme, requireAuth, requireOnboarding, getGreeting, toast, formatTime, todayISO, daysUntil, sessionChip, statusBadge, setProgress, confirmDialog } from '../js/app.js';
import api, { getUser } from '../js/api.js';

initTheme();

if (requireAuth() && requireOnboarding()) {
  const user = getUser();

  // ── INIT ──────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', async () => {
  // Greeting
  const greetingEl = document.getElementById('greeting-text');
  const greetingSubEl = document.getElementById('greeting-sub');
  if (greetingEl) greetingEl.textContent = `${getGreeting()}, ${user?.name?.split(' ')[0] || 'Student'}! 👋`;
  if (greetingSubEl) {
    const today = new Date();
    greetingSubEl.textContent = `${today.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' })} — Here's your study plan.`;
  }

  // Today's date display
  const todayDateEl = document.getElementById('today-date');
  if (todayDateEl) todayDateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' });

  // Load all data in parallel
  try {
    const [timetable, overview, subjectProgress, streaks, recommendations, examPrep] = await Promise.allSettled([
      api.getTimetable(todayISO()),
      api.getOverview(),
      api.getSubjectProgress(),
      api.getStreaks(),
      api.getRecommendations(),
      api.getExamPrep(),
    ]);

    renderStats(overview.value, timetable.value, streaks.value);
    renderSessions(timetable.value);
    renderExams(examPrep.value);
    renderRecommendations(recommendations.value);
    renderProgressRing(overview.value, subjectProgress.value);
  } catch (err) {
    toast.error('Load Error', 'Some data failed to load. Please refresh.');
  }
});

// ── RENDER STATS ──────────────────────────────────────────────
function renderStats(overview, timetable, streaks) {
  const sessions = timetable?.sessions || [];
  const completedToday = sessions.filter(s => s.status === 'completed').length;
  const remainingToday = sessions.filter(s => s.status === 'scheduled').length;
  const hoursToday = sessions
    .filter(s => s.status === 'completed')
    .reduce((sum, s) => sum + s.duration_minutes / 60, 0);

  animate(document.getElementById('stat-hours'), hoursToday.toFixed(1) + 'h');
  animate(document.getElementById('stat-completed'), completedToday);
  animate(document.getElementById('stat-remaining'), remainingToday);
  animate(document.getElementById('stat-streak'), streaks?.current_streak ?? overview?.current_streak ?? 0);
}

function animate(el, value) {
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateY(8px)';
  setTimeout(() => {
    el.textContent = value;
    el.style.transition = 'all 0.4s cubic-bezier(0.34,1.56,0.64,1)';
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
  }, 100);
}

// ── RENDER SESSIONS ────────────────────────────────────────────
function renderSessions(timetable) {
  const container = document.getElementById('today-sessions');
  const sessions = timetable?.sessions || [];

  if (!sessions.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📅</div>
        <div class="empty-state-title">No sessions today</div>
        <div class="empty-state-text">Generate your AI plan to see today's schedule.</div>
        <button class="btn btn-primary mt-4" onclick="generatePlan()">🤖 Generate Plan</button>
      </div>`;
    return;
  }

  container.innerHTML = '';
  sessions.forEach((s, idx) => {
    const card = document.createElement('div');
    card.className = 'session-card-dash animate-fade-up';
    card.style.animationDelay = `${idx * 60}ms`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `${s.topic_name} at ${formatTime(s.start_time)}`);
    card.innerHTML = `
      <div class="session-color-bar" style="background:${s.subject_color}" aria-hidden="true"></div>
      <div style="flex:1;min-width:0">
        <div class="font-semibold text-sm truncate" style="color:var(--text-primary)">${s.topic_name}</div>
        <div class="text-xs text-muted">${s.subject_name} · ${formatTime(s.start_time)} · ${s.duration_minutes}min</div>
        <div class="flex gap-2 mt-1">${sessionChip(s.session_type)} ${statusBadge(s.status)}</div>
      </div>
      <div class="flex gap-2" role="group" aria-label="Session actions">
        ${s.status === 'scheduled' ? `
          <button class="btn btn-success btn-sm complete-btn" data-id="${s.id}" aria-label="Complete session">✓</button>
          <button class="btn btn-ghost btn-sm skip-btn" data-id="${s.id}" aria-label="Skip session">✕</button>
          <a href="../focus/index.html?session=${s.id}" class="btn btn-primary btn-sm" aria-label="Start focus session">▶</a>
        ` : ''}
      </div>
    `;
    container.appendChild(card);
  });

  // Session action handlers
  container.addEventListener('click', async (e) => {
    const completeBtn = e.target.closest('.complete-btn');
    const skipBtn = e.target.closest('.skip-btn');

    if (completeBtn) {
      const id = completeBtn.dataset.id;
      completeBtn.disabled = true;
      completeBtn.textContent = '...';
      try {
        await api.completeSession(id);
        toast.success('✅ Session Complete!', 'Great work! Keep it up!');
        location.reload();
      } catch (err) { toast.error('Error', err.message); completeBtn.disabled = false; }
    }

    if (skipBtn) {
      const id = skipBtn.dataset.id;
      skipBtn.disabled = true;
      try {
        await api.skipSession(id);
        toast.info('Session skipped', 'The AI will note this for future planning.');
        location.reload();
      } catch (err) { toast.error('Error', err.message); skipBtn.disabled = false; }
    }
  });
}

// ── RENDER EXAMS ──────────────────────────────────────────────
function renderExams(examPrep) {
  const container = document.getElementById('upcoming-exams');
  const exams = examPrep?.upcoming_exams || [];

  if (!exams.length) {
    container.innerHTML = `<div class="empty-state" style="padding:var(--space-6)"><div class="empty-state-icon">📅</div><div class="text-sm text-muted">No upcoming exams. Add exam dates in Subjects.</div></div>`;
    return;
  }

  container.innerHTML = '';
  exams.slice(0, 5).forEach(exam => {
    const days = exam.days_left;
    const urgency = days <= 3 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : 'var(--success)';
    const card = document.createElement('div');
    card.className = 'exam-card animate-scale-in';
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `${exam.subject_name} exam in ${days} days`);
    card.innerHTML = `
      <div style="width:4px;height:50px;background:${exam.subject_color};border-radius:var(--radius-full);flex-shrink:0" aria-hidden="true"></div>
      <div style="flex:1;min-width:0">
        <div class="font-semibold text-sm truncate" style="color:var(--text-primary)">${exam.subject_name}</div>
        <div class="text-xs text-muted">${exam.exam_date} · ${exam.readiness_percent}% ready</div>
        <div class="progress-bar sm mt-2" role="progressbar" aria-valuenow="${exam.readiness_percent}" aria-valuemin="0" aria-valuemax="100" aria-label="Readiness">
          <div class="progress-fill" style="width:${exam.readiness_percent}%"></div>
        </div>
      </div>
      <div>
        <div class="exam-countdown" style="color:${urgency}" aria-label="${days} days left">${days}</div>
        <div class="text-xs text-muted text-center">${days === 1 ? 'day' : 'days'}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

// ── RENDER RECOMMENDATIONS ────────────────────────────────────
function renderRecommendations(recs) {
  const container = document.getElementById('ai-recommendations');
  const tipEl = document.getElementById('study-tip');
  const msgEl = document.getElementById('motivational-msg');

  if (recs?.study_tip && tipEl) tipEl.textContent = recs.study_tip;
  if (recs?.motivational_message && msgEl) msgEl.textContent = recs.motivational_message;

  const items = [
    ...(recs?.what_to_study_today || []).slice(0, 2).map(r => ({ icon: '📖', text: `Study <strong>${r.topic}</strong> (${r.subject}) — ${r.reason}` })),
    ...(recs?.subjects_needing_attention || []).slice(0, 1).map(r => ({ icon: '⚠️', text: `<strong>${r.subject}</strong>: ${r.issue}. ${r.suggestion}` })),
    ...(recs?.upcoming_exam_alerts || []).slice(0, 1).map(r => ({ icon: '⏰', text: `<strong>${r.subject}</strong> exam in ${r.days_left} days — ${r.readiness}` })),
  ];

  if (!items.length) {
    container.innerHTML = '<div class="text-sm text-muted">Generate your AI plan to get personalized recommendations.</div>';
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="ai-rec-item" role="listitem">
      <span aria-hidden="true">${item.icon}</span> <span>${item.text}</span>
    </div>
  `).join('');
}

// ── RENDER PROGRESS RING ──────────────────────────────────────
function renderProgressRing(overview, subjects) {
  const pct = overview?.overall_percent ?? 0;
  const ring = document.getElementById('progress-ring');
  const pctEl = document.getElementById('ring-pct');

  if (ring) {
    const circumference = 251.2;
    const offset = circumference - (pct / 100) * circumference;
    setTimeout(() => { ring.style.strokeDashoffset = offset; }, 200);
  }
  if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;

  // Subject progress bars
  const barsContainer = document.getElementById('subject-progress-bars');
  if (!barsContainer || !subjects?.length) return;

  barsContainer.innerHTML = subjects.slice(0, 4).map(s => `
    <div style="margin-bottom:var(--space-2)">
      <div class="flex justify-between text-xs mb-1">
        <span class="text-secondary truncate" style="max-width:150px">${s.subject_name}</span>
        <span class="font-semibold" style="color:var(--text-primary)">${s.progress_percent}%</span>
      </div>
      <div class="progress-bar sm" role="progressbar" aria-valuenow="${s.progress_percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${s.subject_name} progress">
        <div class="progress-fill" style="width:${s.progress_percent}%;background:${s.subject_color}"></div>
      </div>
    </div>
  `).join('');
}

// ── ACTIONS ───────────────────────────────────────────────────
document.getElementById('redistribute-btn')?.addEventListener('click', async () => {
  const btn = document.getElementById('redistribute-btn');
  btn.disabled = true;
  btn.textContent = '⏳ Syncing...';
  try {
    const result = await api.redistributeMissed();
    toast.success('✅ Synced!', `${result.redistributed} missed sessions redistributed.`);
    setTimeout(() => location.reload(), 1000);
  } catch (err) {
    toast.error('Sync failed', err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = '🔄 Sync Missed';
  }
});

document.getElementById('regen-plan-btn')?.addEventListener('click', () => {
  confirmDialog('Regenerate AI Plan?',
    'This will replace all your scheduled future sessions with a fresh AI-generated plan. Are you sure?',
    async () => {
      try {
        toast.info('Generating...', 'The AI is creating your new plan.');
        await api.generatePlan(true);
        toast.success('✅ New Plan Ready!', 'Your schedule has been regenerated.');
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        toast.error('Generation failed', err.message);
      }
    }
  );
});

document.getElementById('refresh-rec')?.addEventListener('click', async () => {
  try {
    const recs = await api.getRecommendations();
    renderRecommendations(recs);
    toast.info('Refreshed!', 'AI recommendations updated.');
  } catch {}
});

window.generatePlan = async () => {
  try {
    toast.info('Generating...', 'Creating your personalized plan...');
    await api.generatePlan(false);
    toast.success('Plan ready!', 'Your AI timetable is ready.');
    location.reload();
  } catch (err) {
    toast.error('Failed', err.message);
  }
};
}

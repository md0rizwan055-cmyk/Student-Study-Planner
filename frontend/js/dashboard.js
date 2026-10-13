/**
 * dashboard.js — Main Dashboard State, Rendering & Real-Time Sync
 */
import { initTheme, requireAuth, requireOnboarding, getGreeting, toast, formatTime, todayISO, sessionChip, statusBadge, confirmDialog } from './app.js';
import api, { getUser } from './api.js';
import { createFocusModule } from './dashboard-focus.js';
import { createCalendarModule } from './dashboard-calendar.js';

initTheme();

if (requireAuth() && requireOnboarding()) {
  const user = getUser();
  let focusModule = null;
  let calendarModule = null;

  // Active state
  let currentActiveDate = todayISO();
  let cachedTimetable = null;
  let cachedOverview = null;
  let cachedStreaks = null;
  let cachedSubjectProgress = null;
  let cachedAnalytics = null;

  // ── INIT DASHBOARD ────────────────────────────────────────────
  async function initDashboard() {
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
    if (todayDateEl) {
      todayDateEl.textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' });
    }

    // Initialize modular components
    focusModule = createFocusModule({
      onSessionCompleted: async (sessionId) => {
        await syncDashboardState();
      },
      onSessionUpdated: async () => {
        await syncDashboardState();
      }
    });

    calendarModule = createCalendarModule({
      onDateSelected: async (dateStr) => {
        currentActiveDate = dateStr;
        await updateForSelectedDate(dateStr);
      },
      onStartFocus: (sessionId) => {
        focusModule?.selectSession(sessionId, true);
      },
      onSessionStatusChanged: async (sessionId, newStatus) => {
        await syncDashboardState();
      }
    });

    // Load initial data
    try {
      const [timetable, overview, subjectProgress, streaks, recommendations, examPrep, dailyAnalytics] = await Promise.allSettled([
        api.getTimetable(todayISO()),
        api.getOverview(),
        api.getSubjectProgress(),
        api.getStreaks(),
        api.getRecommendations(),
        api.getExamPrep(),
        api.getDailyAnalytics(todayISO(), 7),
      ]);

      cachedTimetable = timetable.value;
      cachedOverview = overview.value;
      cachedSubjectProgress = subjectProgress.value;
      cachedStreaks = streaks.value;
      cachedAnalytics = dailyAnalytics.value;

      renderStats(cachedOverview, cachedTimetable, cachedStreaks, currentActiveDate);
      renderTodaySessions(cachedTimetable);
      renderExams(examPrep.value);
      renderRecommendations(recommendations.value);
      renderProgressRing(cachedOverview, cachedSubjectProgress);
      renderDailyAnalytics(cachedAnalytics);

      // Initialize calendar
      await calendarModule.init();

      // Populate Focus Mode sessions dropdown
      await focusModule.loadSessions(cachedTimetable?.sessions);

      // Check URL parameters for ?session=<id>
      const urlParams = new URLSearchParams(window.location.search);
      const sessionParam = urlParams.get('session');
      if (sessionParam) {
        focusModule.selectSession(sessionParam, true);
      }
    } catch (err) {
      console.error('Initial dashboard load error:', err);
      toast.error('Load Error', 'Some dashboard components could not be loaded.');
    }

    setupActionHandlers();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDashboard);
  } else {
    initDashboard();
  }

  // ── REAL-TIME SYNCHRONIZATION ─────────────────────────────────
  async function syncDashboardState() {
    try {
      const [timetable, overview, subjectProgress, streaks, dailyAnalytics] = await Promise.all([
        api.getTimetable(todayISO()),
        api.getOverview(),
        api.getSubjectProgress(),
        api.getStreaks(),
        api.getDailyAnalytics(currentActiveDate, 7),
      ]);

      cachedTimetable = timetable;
      cachedOverview = overview;
      cachedSubjectProgress = subjectProgress;
      cachedStreaks = streaks;
      cachedAnalytics = dailyAnalytics;

      renderStats(cachedOverview, cachedTimetable, cachedStreaks, currentActiveDate);
      renderTodaySessions(cachedTimetable);
      renderProgressRing(cachedOverview, cachedSubjectProgress);
      renderDailyAnalytics(cachedAnalytics);

      if (calendarModule) {
        calendarModule.refresh();
      }

      if (focusModule) {
        focusModule.loadSessions(cachedTimetable?.sessions);
      }
    } catch (err) {
      console.error('Dashboard sync error:', err);
    }
  }

  // ── DATE-AWARE SELECTION UPDATE ───────────────────────────────
  async function updateForSelectedDate(dateStr) {
    try {
      const isToday = dateStr === todayISO();
      const labelEl = document.getElementById('stat-hours-label');
      if (labelEl) {
        labelEl.textContent = isToday ? 'Study Hours Today' : `Study Hours (${dateStr.slice(5)})`;
      }

      // Fetch day sessions and recalculate stats for that day
      const dayData = await api.getTimetable(dateStr);
      const streaks = await api.getStreaks();
      const analytics = await api.getDailyAnalytics(dateStr, 7);

      cachedStreaks = streaks;
      cachedAnalytics = analytics;

      renderStats(cachedOverview, dayData, cachedStreaks, dateStr);
      renderDailyAnalytics(cachedAnalytics);
    } catch (e) {
      console.error('Failed to update for date:', dateStr, e);
    }
  }

  // ── RENDER STATS ──────────────────────────────────────────────
  function renderStats(overview, timetable, streaks, dateStr = todayISO()) {
    const sessions = timetable?.sessions || [];
    const isPast = dateStr < todayISO();

    const completed = sessions.filter(s => s.status === 'completed').length;
    const remaining = sessions.filter(s => s.status === 'scheduled').length;
    const hours = sessions
      .filter(s => s.status === 'completed')
      .reduce((sum, s) => sum + (s.duration_minutes || 0) / 60, 0);

    animate(document.getElementById('stat-hours'), hours.toFixed(1) + 'h');
    animate(document.getElementById('stat-completed'), completed);
    animate(document.getElementById('stat-remaining'), isPast ? 0 : remaining);
    animate(document.getElementById('stat-streak'), streaks?.current_streak ?? overview?.current_streak ?? 0);
  }

  function animate(el, value) {
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    setTimeout(() => {
      el.textContent = value;
      el.style.transition = 'all 0.3s cubic-bezier(0.34,1.56,0.64,1)';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 60);
  }

  // ── RENDER TODAY'S SESSIONS WITH CHECKBOX SYSTEM ──────────────
  function renderTodaySessions(timetable) {
    const container = document.getElementById('today-sessions');
    if (!container) return;

    const sessions = timetable?.sessions || [];

    if (!sessions.length) {
      container.innerHTML = `
        <div class="empty-state" style="padding:var(--space-6)">
          <div class="empty-state-icon">📅</div>
          <div class="empty-state-title">No sessions today</div>
          <div class="empty-state-text">Generate your AI plan to see today's schedule.</div>
          <button class="btn btn-primary mt-4" id="inline-gen-plan-btn">🤖 Generate Plan</button>
        </div>`;

      document.getElementById('inline-gen-plan-btn')?.addEventListener('click', async () => {
        await handleGeneratePlan();
      });
      return;
    }

    container.innerHTML = '';
    sessions.forEach((s, idx) => {
      const isCompleted = s.status === 'completed';
      const isSkipped = s.status === 'skipped';

      const card = document.createElement('div');
      card.className = `session-card-dash ${isCompleted ? 'completed' : ''} animate-fade-up`;
      card.style.animationDelay = `${idx * 40}ms`;
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', `${s.topic_name} at ${formatTime(s.start_time)}`);
      card.dataset.sessionId = s.id;

      card.innerHTML = `
        <div class="session-checkbox-wrapper">
          <input type="checkbox" id="today-check-${s.id}" class="session-checkbox today-session-checkbox" data-id="${s.id}" ${isCompleted ? 'checked' : ''} aria-label="Toggle completed for ${s.topic_name}">
        </div>
        <div class="session-color-bar" style="background:${s.subject_color || '#00f5a0'}" aria-hidden="true"></div>
        <div style="flex:1;min-width:0">
          <div class="font-semibold text-sm truncate session-topic-title" style="color:var(--text-primary);${isCompleted ? 'text-decoration:line-through;opacity:0.75' : ''}">${s.topic_name}</div>
          <div class="text-xs text-muted">${s.subject_name} · ${formatTime(s.start_time)} · ${s.duration_minutes}min</div>
          <div class="flex gap-2 mt-1 flex-wrap">${sessionChip(s.session_type)} ${statusBadge(s.status)}</div>
        </div>
        <div class="flex gap-2 items-center" role="group" aria-label="Session actions">
          ${!isCompleted ? `
            <button class="btn btn-primary btn-sm today-focus-btn" data-id="${s.id}" title="Start Focus Session" aria-label="Start focus session">▶</button>
            <button class="btn btn-ghost btn-sm today-skip-btn" data-id="${s.id}" title="Skip session" aria-label="Skip session">✕</button>
          ` : ''}
        </div>
      `;
      container.appendChild(card);
    });
  }

  // ── RENDER DAILY ANALYTICS SECTION ────────────────────────────
  function renderDailyAnalytics(analyticsData) {
    const grid = document.getElementById('daily-analytics-grid');
    const hoursEl = document.getElementById('summary-study-hours');
    const countEl = document.getElementById('summary-completed-count');
    const avgPctEl = document.getElementById('summary-avg-pct');

    if (!analyticsData || !grid) return;

    if (hoursEl) hoursEl.textContent = `${analyticsData.summary?.total_study_hours || '0.0'}h`;
    if (countEl) countEl.textContent = `${analyticsData.summary?.total_completed || 0}`;
    if (avgPctEl) avgPctEl.textContent = `${analyticsData.summary?.avg_completion_pct || 0}%`;

    const days = analyticsData.days || [];
    grid.innerHTML = '';

    days.forEach(d => {
      const card = document.createElement('div');
      card.className = `analytics-day-card ${d.is_today ? 'today' : ''} ${d.is_selected ? 'selected' : ''}`;
      card.dataset.date = d.date;
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', `${d.day_name}: ${d.completion_percentage}% completed`);

      card.innerHTML = `
        <div class="analytics-day-header">${d.day_label}</div>
        <div class="analytics-day-sub">${d.date.slice(5)}</div>
        <div class="analytics-pct-badge">${d.completion_percentage}%</div>
        <div class="analytics-stat-line"><strong>${d.study_hours}h</strong> studied</div>
        <div class="analytics-stat-line text-muted">${d.completed}/${d.total_scheduled} done</div>
        <div class="analytics-progress-mini">
          <div class="analytics-progress-fill" style="width:${d.completion_percentage}%"></div>
        </div>
      `;

      card.addEventListener('click', () => {
        if (calendarModule) {
          calendarModule.selectDate(d.date);
        }
      });

      grid.appendChild(card);
    });
  }

  // ── RENDER PROGRESS RING ──────────────────────────────────────
  function renderProgressRing(overview, subjects) {
    const pct = overview?.overall_percent ?? 0;
    const ring = document.getElementById('progress-ring');
    const pctEl = document.getElementById('ring-pct');

    if (ring) {
      const circumference = 251.2;
      const offset = circumference - (pct / 100) * circumference;
      ring.style.strokeDashoffset = offset;
    }
    if (pctEl) pctEl.textContent = `${Math.round(pct)}%`;

    // Subject progress bars
    const barsContainer = document.getElementById('subject-progress-bars');
    if (!barsContainer || !subjects?.length) return;

    barsContainer.innerHTML = subjects.slice(0, 4).map(s => `
      <div style="margin-bottom:var(--space-2)">
        <div class="flex justify-between text-xs mb-1">
          <span class="text-secondary truncate" style="max-width:140px">${s.subject_name}</span>
          <span class="font-semibold" style="color:var(--text-primary)">${s.progress_percent}%</span>
        </div>
        <div class="progress-bar sm" role="progressbar" aria-valuenow="${s.progress_percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${s.subject_name} progress">
          <div class="progress-fill" style="width:${s.progress_percent}%;background:${s.subject_color}"></div>
        </div>
      </div>
    `).join('');
  }

  // ── RENDER EXAMS ──────────────────────────────────────────────
  function renderExams(examPrep) {
    const container = document.getElementById('upcoming-exams');
    if (!container) return;

    const exams = examPrep?.upcoming_exams || [];
    if (!exams.length) {
      container.innerHTML = `<div class="empty-state" style="padding:var(--space-4)"><div class="empty-state-icon">📅</div><div class="text-xs text-muted">No upcoming exams. Add dates in Subjects.</div></div>`;
      return;
    }

    container.innerHTML = '';
    exams.slice(0, 4).forEach(exam => {
      const days = exam.days_left;
      const urgency = days <= 3 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : 'var(--success)';
      const card = document.createElement('div');
      card.className = 'exam-card animate-scale-in';
      card.setAttribute('role', 'listitem');
      card.setAttribute('aria-label', `${exam.subject_name} exam in ${days} days`);
      card.innerHTML = `
        <div style="width:4px;height:46px;background:${exam.subject_color};border-radius:var(--radius-full);flex-shrink:0" aria-hidden="true"></div>
        <div style="flex:1;min-width:0">
          <div class="font-semibold text-xs truncate" style="color:var(--text-primary)">${exam.subject_name}</div>
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

    if (!container) return;
    if (!items.length) {
      container.innerHTML = '<div class="text-xs text-muted">Generate your AI plan to get personalized recommendations.</div>';
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="ai-rec-item" role="listitem">
        <span aria-hidden="true">${item.icon}</span> <span>${item.text}</span>
      </div>
    `).join('');
  }

  // ── SETUP ACTION HANDLERS (NO PAGE RELOAD) ────────────────────
  function setupActionHandlers() {
    const todayContainer = document.getElementById('today-sessions');

    // Checkbox toggling (Complete / Uncomplete)
    todayContainer?.addEventListener('change', async (e) => {
      const checkbox = e.target.closest('.today-session-checkbox');
      if (!checkbox) return;

      const id = checkbox.dataset.id;
      const isChecking = checkbox.checked;
      const card = checkbox.closest('.session-card-dash');
      const topicEl = card?.querySelector('.session-topic-title');

      // Optimistic UI update
      if (isChecking) {
        card?.classList.add('completed');
        if (topicEl) {
          topicEl.style.textDecoration = 'line-through';
          topicEl.style.opacity = '0.75';
        }
      } else {
        card?.classList.remove('completed');
        if (topicEl) {
          topicEl.style.textDecoration = 'none';
          topicEl.style.opacity = '1';
        }
      }

      try {
        if (isChecking) {
          await api.completeSession(id);
          toast.success('Session Completed! ✅', 'Great work!');
        } else {
          await api.uncompleteSession(id);
          toast.info('Session Reopened', 'Status restored to scheduled.');
        }

        // Live synchronisation across the whole dashboard
        await syncDashboardState();
      } catch (err) {
        // Rollback
        checkbox.checked = !isChecking;
        if (!isChecking) {
          card?.classList.add('completed');
          if (topicEl) {
            topicEl.style.textDecoration = 'line-through';
            topicEl.style.opacity = '0.75';
          }
        } else {
          card?.classList.remove('completed');
          if (topicEl) {
            topicEl.style.textDecoration = 'none';
            topicEl.style.opacity = '1';
          }
        }
        toast.error('Update Failed', err.message || 'Unable to update session');
      }
    });

    // Start Focus / Skip buttons
    todayContainer?.addEventListener('click', async (e) => {
      const focusBtn = e.target.closest('.today-focus-btn');
      const skipBtn = e.target.closest('.today-skip-btn');

      if (focusBtn) {
        const id = focusBtn.dataset.id;
        focusModule?.selectSession(id, true);
      }

      if (skipBtn) {
        const id = skipBtn.dataset.id;
        skipBtn.disabled = true;
        try {
          await api.skipSession(id);
          toast.info('Session Skipped', 'Updated in schedule.');
          await syncDashboardState();
        } catch (err) {
          toast.error('Error', err.message);
          skipBtn.disabled = false;
        }
      }
    });

    // Quick start focus
    document.getElementById('quick-start-focus-btn')?.addEventListener('click', () => {
      const focusCard = document.getElementById('focus-timer-card');
      focusCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // Sync missed sessions
    document.getElementById('redistribute-btn')?.addEventListener('click', async () => {
      const btn = document.getElementById('redistribute-btn');
      btn.disabled = true;
      btn.textContent = '⏳ Syncing...';
      try {
        const result = await api.redistributeMissed();
        toast.success('✅ Synced!', result.message || `${result.redistributed} missed sessions redistributed.`);
        await syncDashboardState();
      } catch (err) {
        toast.error('Sync failed', err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = '🔄 Sync Missed';
      }
    });

    // Regenerate plan
    document.getElementById('regen-plan-btn')?.addEventListener('click', () => {
      confirmDialog('Regenerate AI Plan?',
        'This will replace scheduled future sessions with a fresh AI-generated plan. Continue?',
        async () => {
          await handleGeneratePlan();
        }
      );
    });

    document.getElementById('gen-plan-header-btn')?.addEventListener('click', async () => {
      await handleGeneratePlan();
    });

    document.getElementById('refresh-rec')?.addEventListener('click', async () => {
      try {
        const recs = await api.getRecommendations();
        renderRecommendations(recs);
        toast.info('Refreshed!', 'AI recommendations updated.');
      } catch (e) {}
    });
  }

  async function handleGeneratePlan() {
    try {
      toast.info('Generating AI Plan...', 'Analyzing subjects, difficulty, and exams...');
      await api.generatePlan(true);
      toast.success('✨ AI Plan Generated!', 'Your schedule has been updated.');
      await syncDashboardState();
    } catch (err) {
      toast.error('Generation failed', err.message);
    }
  }
}

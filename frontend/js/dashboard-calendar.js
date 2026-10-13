/**
 * dashboard-calendar.js — Compact Calendar Widget & Selected Day Sessions for Dashboard
 */
import { formatTime, todayISO, formatDateISO, parseISODate, sessionChip, statusBadge, toast } from './app.js';
import api from './api.js';

export function createCalendarModule({ onDateSelected, onStartFocus, onSessionStatusChanged }) {
  const today = new Date();
  let viewYear = today.getFullYear();
  let viewMonth = today.getMonth();
  let selectedDate = todayISO();
  let sessionsByDate = {}; // dateStr -> session[]
  let subjects = [];

  const gridEl = document.getElementById('dash-cal-grid');
  const monthLabelEl = document.getElementById('dash-cal-month-label');
  const prevMonthBtn = document.getElementById('dash-cal-prev-btn');
  const nextMonthBtn = document.getElementById('dash-cal-next-btn');
  const todayBtn = document.getElementById('dash-cal-today-btn');
  const legendEl = document.getElementById('dash-cal-legend');
  const selectedDaySessionsEl = document.getElementById('dash-selected-day-sessions');
  const selectedDayTitleEl = document.getElementById('dash-selected-day-title');
  const selectedDaySubtitleEl = document.getElementById('dash-selected-day-subtitle');

  async function init() {
    try {
      subjects = await api.getSubjects();
      renderLegend();
    } catch (e) {}

    await renderMonth();
    await loadDaySessions(selectedDate);
    setupEventListeners();
  }

  function renderLegend() {
    if (!legendEl) return;
    legendEl.innerHTML = subjects.slice(0, 5).map(s => `
      <div class="dash-cal-legend-item" role="listitem">
        <span class="dash-cal-legend-dot" style="background:${s.color || '#00f5a0'}" aria-hidden="true"></span>
        <span class="text-secondary text-xs truncate" style="max-width:110px">${s.name}</span>
      </div>
    `).join('');
  }

  async function renderMonth() {
    if (!gridEl || !monthLabelEl) return;

    monthLabelEl.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
    gridEl.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:24px;color:var(--text-muted);font-size:var(--text-xs)">Loading schedule...</div>';

    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);

    // Calculate dates needed for full 7-col weeks
    const startDate = new Date(firstDay);
    const dow = startDate.getDay();
    startDate.setDate(startDate.getDate() - (dow === 0 ? 6 : dow - 1));

    const endDate = new Date(lastDay);
    const endDow = endDate.getDay();
    if (endDow !== 0) endDate.setDate(endDate.getDate() + (7 - endDow));

    try {
      let cur = new Date(startDate);
      while (cur <= endDate) {
        const weekStart = formatDateISO(cur);
        try {
          const data = await api.getWeekly(weekStart);
          data.days?.forEach(d => {
            sessionsByDate[d.date] = d.sessions || [];
          });
        } catch (e) {}
        cur.setDate(cur.getDate() + 7);
      }
    } catch (e) {}

    buildGrid();
  }

  function buildGrid() {
    if (!gridEl) return;
    gridEl.innerHTML = '';

    const firstDay = new Date(viewYear, viewMonth, 1);
    const lastDay = new Date(viewYear, viewMonth + 1, 0);
    const todayStr = todayISO();

    const start = new Date(firstDay);
    const dow = start.getDay();
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));

    const end = new Date(lastDay);
    const endDow = end.getDay();
    if (endDow !== 0) end.setDate(end.getDate() + (7 - endDow));

    let cur = new Date(start);
    while (cur <= end) {
      const dateStr = formatDateISO(cur);
      const isToday = dateStr === todayStr;
      const isCurrentMonth = cur.getMonth() === viewMonth;
      const isSelected = dateStr === selectedDate;
      const sessions = sessionsByDate[dateStr] || [];
      const completedCount = sessions.filter(s => s.status === 'completed').length;
      const totalCount = sessions.length;
      const isAllCompleted = totalCount > 0 && completedCount === totalCount;
      const hasCompleted = completedCount > 0;

      const cell = document.createElement('div');
      cell.className = `dash-cal-cell${isToday ? ' today' : ''}${!isCurrentMonth ? ' other-month' : ''}${isSelected ? ' selected' : ''}${isAllCompleted ? ' completed-day' : ''}`;
      cell.setAttribute('role', 'gridcell');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-label', `${dateStr}${totalCount ? ', ' + totalCount + ' sessions' : ''}`);
      cell.setAttribute('aria-selected', isSelected ? 'true' : 'false');
      cell.dataset.date = dateStr;

      let dotsHtml = '';
      if (sessions.length > 0) {
        dotsHtml = `
          <div class="dash-cal-dots">
            ${sessions.slice(0, 3).map(s => `
              <span class="dash-cal-dot ${s.status === 'completed' ? 'completed' : ''}" style="background:${s.subject_color || '#00f5a0'}" title="${s.topic_name}"></span>
            `).join('')}
            ${sessions.length > 3 ? `<span class="dash-cal-more">+${sessions.length - 3}</span>` : ''}
          </div>
        `;
      }

      let badgeHtml = '';
      if (isAllCompleted) {
        badgeHtml = `<div class="dash-cal-tick-badge all-completed" title="All ${totalCount} sessions completed! ✓">✓</div>`;
      } else if (hasCompleted) {
        badgeHtml = `<div class="dash-cal-tick-badge partial-completed" title="${completedCount}/${totalCount} completed">✓ ${completedCount}/${totalCount}</div>`;
      } else if (totalCount > 0) {
        badgeHtml = `<div class="dash-cal-session-count text-muted">0/${totalCount}</div>`;
      }

      cell.innerHTML = `
        <div class="dash-cal-day-num">${cur.getDate()}</div>
        ${dotsHtml}
        ${badgeHtml}
      `;

      cell.addEventListener('click', () => selectDate(dateStr, cell));
      cell.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectDate(dateStr, cell);
        }
      });

      gridEl.appendChild(cell);
      cur.setDate(cur.getDate() + 1);
    }
  }

  async function selectDate(dateStr, cellEl = null) {
    selectedDate = dateStr;

    document.querySelectorAll('.dash-cal-cell').forEach(c => {
      if (c.dataset.date === dateStr) {
        c.classList.add('selected');
        c.setAttribute('aria-selected', 'true');
      } else {
        c.classList.remove('selected');
        c.setAttribute('aria-selected', 'false');
      }
    });

    await loadDaySessions(dateStr);

    if (typeof onDateSelected === 'function') {
      onDateSelected(dateStr);
    }
  }

  async function loadDaySessions(dateStr) {
    if (!selectedDaySessionsEl) return;

    const d = new Date(dateStr + 'T00:00:00');
    const isToday = dateStr === todayISO();

    if (selectedDayTitleEl) {
      selectedDayTitleEl.textContent = d.toLocaleDateString('en-IN', { weekday: 'long', month: 'short', day: 'numeric' });
    }
    if (selectedDaySubtitleEl) {
      selectedDaySubtitleEl.textContent = isToday ? "Today's Schedule" : `Schedule for ${d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`;
    }

    let daySessions = sessionsByDate[dateStr];
    if (daySessions === undefined) {
      selectedDaySessionsEl.innerHTML = '<div class="loading-dots" style="justify-content:center;padding:var(--space-4)"><span></span><span></span><span></span></div>';
      try {
        const data = await api.getTimetable(dateStr);
        daySessions = data?.sessions || [];
        sessionsByDate[dateStr] = daySessions;
      } catch (e) {
        daySessions = [];
        sessionsByDate[dateStr] = [];
      }
    }

    renderSelectedDayList(daySessions, dateStr);
  }

  function renderSelectedDayList(sessions, dateStr) {
    if (!selectedDaySessionsEl) return;

    if (!sessions || !sessions.length) {
      selectedDaySessionsEl.innerHTML = `
        <div class="empty-state" style="padding:var(--space-4)">
          <div class="empty-state-icon" style="font-size:1.5rem">😴</div>
          <div class="text-xs text-muted text-center">No sessions scheduled for this date.</div>
        </div>
      `;
      return;
    }

    selectedDaySessionsEl.innerHTML = '';
    sessions.forEach(s => {
      const isCompleted = s.status === 'completed';
      const isSkipped = s.status === 'skipped';
      const card = document.createElement('div');
      card.className = `selected-day-session-card ${isCompleted ? 'completed' : ''}`;
      card.dataset.sessionId = s.id;
      card.innerHTML = `
        <div class="session-checkbox-wrapper">
          <input type="checkbox" id="cal-check-${s.id}" class="session-checkbox" data-id="${s.id}" ${isCompleted ? 'checked' : ''} aria-label="Toggle completed for ${s.topic_name}">
        </div>
        <div class="session-color-bar" style="background:${s.subject_color || '#00f5a0'};height:36px" aria-hidden="true"></div>
        <div style="flex:1;min-width:0">
          <div class="font-semibold text-xs truncate session-topic-name" style="color:var(--text-primary);${isCompleted ? 'text-decoration:line-through;opacity:0.75' : ''}">${s.topic_name}</div>
          <div class="text-xs text-muted truncate">${s.subject_name} · ${formatTime(s.start_time)} · ${s.duration_minutes}m</div>
          <div class="flex gap-1 mt-1 flex-wrap">${sessionChip(s.session_type)} ${statusBadge(s.status)}</div>
        </div>
        <div class="flex gap-1" role="group" aria-label="Session actions">
          ${!isCompleted ? `
            <button class="btn btn-ghost btn-xs cal-focus-btn" data-id="${s.id}" title="Start Focus Session" aria-label="Start Focus Session">▶</button>
            <button class="btn btn-ghost btn-xs cal-skip-btn" data-id="${s.id}" title="Skip session" aria-label="Skip session">✕</button>
          ` : ''}
        </div>
      `;
      selectedDaySessionsEl.appendChild(card);
    });
  }

  function setupEventListeners() {
    prevMonthBtn?.addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) {
        viewMonth = 11;
        viewYear--;
      }
      renderMonth();
    });

    nextMonthBtn?.addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) {
        viewMonth = 0;
        viewYear++;
      }
      renderMonth();
    });

    todayBtn?.addEventListener('click', () => {
      viewYear = today.getFullYear();
      viewMonth = today.getMonth();
      selectedDate = todayISO();
      renderMonth();
      selectDate(selectedDate);
    });

    // Session list event delegation
    selectedDaySessionsEl?.addEventListener('change', async e => {
      const checkbox = e.target.closest('.session-checkbox');
      if (!checkbox) return;

      const id = checkbox.dataset.id;
      const isChecking = checkbox.checked;
      const card = checkbox.closest('.selected-day-session-card');
      const topicEl = card?.querySelector('.session-topic-name');

      // Update in-memory session object for selectedDate
      const daySessions = sessionsByDate[selectedDate] || [];
      const sessionObj = daySessions.find(x => x.id === id);
      if (sessionObj) {
        sessionObj.status = isChecking ? 'completed' : 'scheduled';
      }

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

      // Immediate calendar grid tick mark update!
      buildGrid();

      try {
        if (isChecking) {
          await api.completeSession(id);
          toast.success('Session Completed! ✅', 'Great progress!');
        } else {
          await api.uncompleteSession(id);
          toast.info('Session Reopened', 'Marked as scheduled.');
        }

        // Notify parent to synchronize all dashboard sections
        if (typeof onSessionStatusChanged === 'function') {
          onSessionStatusChanged(id, isChecking ? 'completed' : 'scheduled');
        }
      } catch (err) {
        // Rollback
        if (sessionObj) {
          sessionObj.status = !isChecking ? 'completed' : 'scheduled';
        }
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
        buildGrid();
        toast.error('Update Failed', 'Unable to update session status.');
      }
    });

    selectedDaySessionsEl?.addEventListener('click', async e => {
      const focusBtn = e.target.closest('.cal-focus-btn');
      const skipBtn = e.target.closest('.cal-skip-btn');

      if (focusBtn) {
        const id = focusBtn.dataset.id;
        if (typeof onStartFocus === 'function') {
          onStartFocus(id);
        }
      }

      if (skipBtn) {
        const id = skipBtn.dataset.id;
        skipBtn.disabled = true;
        try {
          await api.skipSession(id);
          toast.info('Session Skipped', 'Adjusted in your schedule.');
          if (typeof onSessionStatusChanged === 'function') {
            onSessionStatusChanged(id, 'skipped');
          }
        } catch (err) {
          toast.error('Error', err.message);
          skipBtn.disabled = false;
        }
      }
    });
  }

  function refresh() {
    renderMonth();
    loadDaySessions(selectedDate);
  }

  function getSelectedDate() {
    return selectedDate;
  }

  return {
    init,
    refresh,
    selectDate,
    getSelectedDate,
    loadDaySessions,
  };
}

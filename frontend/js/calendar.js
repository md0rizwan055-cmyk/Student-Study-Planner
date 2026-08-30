/**
 * calendar.js — Interactive monthly calendar with study sessions
 */
import { initTheme, requireAuth, toast, formatTime, todayISO, sessionChip } from '../js/app.js';
import api from '../js/api.js';

initTheme();
requireAuth();

const today = new Date();
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();
let selectedDate = todayISO();
let sessionsByDate = {};  // date string -> session[]
let subjects = [];

async function init() {
  try {
    subjects = await api.getSubjects();
    renderLegend();
  } catch {}
  await renderMonth();
  loadDaySessions(selectedDate);
}

function renderLegend() {
  const container = document.getElementById('subject-legend');
  if (!container) return;
  container.innerHTML = subjects.slice(0, 6).map(s => `
    <div class="flex items-center gap-2 text-xs" role="listitem">
      <div style="width:10px;height:10px;background:${s.color};border-radius:2px" aria-hidden="true"></div>
      <span class="text-secondary">${s.name}</span>
    </div>
  `).join('');
}

async function renderMonth() {
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('month-label');
  if (!label) return;

  label.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">Loading calendar...</div>';

  // Load week sessions for the entire month
  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);

  try {
    // Load sessions day by day for visible weeks
    sessionsByDate = {};
    const startDate = new Date(firstDay);
    const dow = startDate.getDay();
    startDate.setDate(startDate.getDate() - (dow === 0 ? 6 : dow - 1));

    const endDate = new Date(lastDay);
    const endDow = endDate.getDay();
    if (endDow !== 0) endDate.setDate(endDate.getDate() + (7 - endDow));

    // Load weekly data
    let cur = new Date(startDate);
    while (cur <= endDate) {
      const weekStart = cur.toISOString().split('T')[0];
      try {
        const data = await api.getWeekly(weekStart);
        data.days?.forEach(d => {
          sessionsByDate[d.date] = d.sessions || [];
        });
      } catch {}
      cur.setDate(cur.getDate() + 7);
    }
  } catch {}

  buildCalendarGrid();
}

function buildCalendarGrid() {
  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';

  const firstDay = new Date(viewYear, viewMonth, 1);
  const lastDay = new Date(viewYear, viewMonth + 1, 0);
  const todayStr = todayISO();

  // Start from Monday of the first week
  const start = new Date(firstDay);
  const dow = start.getDay();
  start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1));

  const end = new Date(lastDay);
  const endDow = end.getDay();
  if (endDow !== 0) end.setDate(end.getDate() + (7 - endDow));

  let cur = new Date(start);
  while (cur <= end) {
    const dateStr = cur.toISOString().split('T')[0];
    const isToday = dateStr === todayStr;
    const isCurrentMonth = cur.getMonth() === viewMonth;
    const isSelected = dateStr === selectedDate;
    const sessions = sessionsByDate[dateStr] || [];

    const cell = document.createElement('div');
    cell.className = `cal-cell${isToday ? ' today' : ''}${!isCurrentMonth ? ' other-month' : ''}${isSelected ? ' selected' : ''}`;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('tabindex', '0');
    cell.setAttribute('aria-label', `${dateStr}${sessions.length ? ', ' + sessions.length + ' sessions' : ''}`);
    cell.setAttribute('aria-selected', isSelected);
    cell.dataset.date = dateStr;

    cell.innerHTML = `
      <div class="cal-day-num">${cur.getDate()}</div>
      ${sessions.slice(0, 3).map(s => `
        <div class="cal-event" style="background:${s.subject_color}" title="${s.topic_name}">
          ${s.topic_name}
        </div>
      `).join('')}
      ${sessions.length > 3 ? `<div style="font-size:9px;color:var(--text-muted)">+${sessions.length-3} more</div>` : ''}
    `;

    cell.addEventListener('click', () => selectDate(dateStr, cell));
    cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectDate(dateStr, cell); } });

    grid.appendChild(cell);
    cur.setDate(cur.getDate() + 1);
  }
}

function selectDate(dateStr, cell) {
  document.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
  cell.classList.add('selected');
  cell.setAttribute('aria-selected', 'true');
  selectedDate = dateStr;
  loadDaySessions(dateStr);
}

async function loadDaySessions(dateStr) {
  const container = document.getElementById('selected-day-sessions');
  const title = document.getElementById('selected-day-title');
  const d = new Date(dateStr + 'T00:00:00');
  if (title) title.textContent = d.toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });

  const sessions = sessionsByDate[dateStr];
  if (sessions === undefined) {
    container.innerHTML = '<div class="loading-dots" style="justify-content:center;padding:var(--space-4)"><span></span><span></span><span></span></div>';
    try {
      const data = await api.getTimetable(dateStr);
      sessionsByDate[dateStr] = data?.sessions || [];
    } catch {
      sessionsByDate[dateStr] = [];
    }
  }

  const daySessions = sessionsByDate[dateStr] || [];
  if (!daySessions.length) {
    container.innerHTML = '<div class="empty-state" style="padding:var(--space-6)"><div class="empty-state-icon" style="font-size:1.5rem">😴</div><div class="text-sm text-muted text-center">No sessions on this day</div></div>';
    return;
  }

  container.innerHTML = daySessions.map(s => `
    <div class="flex items-start gap-3 mb-3 pb-3" style="border-bottom:1px solid var(--border-subtle)" role="listitem">
      <div style="width:3px;height:40px;background:${s.subject_color};border-radius:var(--radius-full);flex-shrink:0;margin-top:2px" aria-hidden="true"></div>
      <div style="flex:1;min-width:0">
        <div class="text-sm font-semibold truncate" style="color:var(--text-primary)">${s.topic_name}</div>
        <div class="text-xs text-muted">${s.subject_name}</div>
        <div class="text-xs text-muted">${formatTime(s.start_time)} · ${s.duration_minutes}min</div>
        ${sessionChip(s.session_type)}
      </div>
    </div>
  `).join('');
}

// Navigation
document.getElementById('prev-month')?.addEventListener('click', () => {
  viewMonth--;
  if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderMonth();
});
document.getElementById('next-month')?.addEventListener('click', () => {
  viewMonth++;
  if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderMonth();
});
document.getElementById('today-btn')?.addEventListener('click', () => {
  viewYear = today.getFullYear();
  viewMonth = today.getMonth();
  selectedDate = todayISO();
  renderMonth();
  loadDaySessions(selectedDate);
});

if (requireAuth()) {
  init();
}

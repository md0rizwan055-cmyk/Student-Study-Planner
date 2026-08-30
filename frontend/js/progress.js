/**
 * progress.js — Analytics dashboard with Chart.js charts
 */
import { initTheme, requireAuth, toast } from '../js/app.js';
import api from '../js/api.js';

initTheme();
requireAuth();

// Chart.js defaults for dark/light mode
function getChartDefaults() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  return {
    textColor: isDark ? '#94a3b8' : '#475569',
    gridColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    bg: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
  };
}

Chart.defaults.font.family = 'Inter, sans-serif';
Chart.defaults.font.size = 12;

let charts = {};

async function loadAll() {
  try {
    const [overview, subjects, weeklyHours, streaks, analytics] = await Promise.allSettled([
      api.getOverview(),
      api.getSubjectProgress(),
      api.getWeeklyHours(8),
      api.getStreaks(),
      api.getAnalytics(),
    ]);

    renderStats(overview.value);
    renderWeeklyChart(weeklyHours.value);
    renderSubjectChart(subjects.value);
    renderSessionsChart(overview.value);
    renderTrendChart(analytics.value);
    renderHeatmap(streaks.value);
    renderSubjectReadiness(subjects.value);
  } catch (err) {
    toast.error('Load failed', err.message);
  }
}

function renderStats(ov) {
  if (!ov) return;
  document.getElementById('stat-topics').textContent = `${ov.completed_topics}/${ov.total_topics}`;
  document.getElementById('stat-hours').textContent = `${ov.total_study_hours}h`;
  document.getElementById('stat-streak').textContent = `${ov.current_streak} 🔥`;
  document.getElementById('stat-sessions').textContent = ov.sessions_completed;
}

function renderWeeklyChart(data) {
  if (!data) return;
  const { textColor, gridColor } = getChartDefaults();
  const ctx = document.getElementById('weekly-chart')?.getContext('2d');
  if (!ctx) return;
  charts.weekly = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(w => w.week_label?.replace('Week of ', '') || ''),
      datasets: [
        { label: 'Planned', data: data.map(w => w.planned_hours), borderColor: 'rgba(255,184,0,0.7)', backgroundColor: 'rgba(255,184,0,0.08)', borderDash: [5,5], tension: 0.4, fill: true, pointRadius: 3 },
        { label: 'Actual', data: data.map(w => w.actual_hours), borderColor: '#00f5a0', backgroundColor: 'rgba(0,245,160,0.12)', tension: 0.4, fill: true, pointRadius: 4, pointHoverRadius: 6 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true },
      },
    },
  });
}

function renderSubjectChart(subjects) {
  if (!subjects?.length) return;
  const { textColor, gridColor } = getChartDefaults();
  const ctx = document.getElementById('subject-chart')?.getContext('2d');
  if (!ctx) return;
  charts.subject = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: subjects.map(s => s.subject_name),
      datasets: [
        { label: 'Progress %', data: subjects.map(s => s.progress_percent), backgroundColor: subjects.map(s => s.subject_color + 'cc'), borderColor: subjects.map(s => s.subject_color), borderWidth: 2, borderRadius: 6 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true, max: 100 },
      },
    },
  });
}

function renderSessionsChart(ov) {
  if (!ov) return;
  const ctx = document.getElementById('sessions-chart')?.getContext('2d');
  if (!ctx) return;
  const { textColor } = getChartDefaults();
  charts.sessions = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: ['Completed', 'Missed', 'Skipped'],
      datasets: [{ data: [ov.sessions_completed, ov.sessions_missed, ov.sessions_skipped], backgroundColor: ['#10b981','#f43f5e','#f59e0b'], borderWidth: 0, hoverOffset: 8 }],
    },
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '65%',
      plugins: { legend: { position: 'bottom', labels: { color: textColor, padding: 16 } } },
    },
  });
}

function renderTrendChart(analytics) {
  if (!analytics?.completion_trend) return;
  const ctx = document.getElementById('trend-chart')?.getContext('2d');
  if (!ctx) return;
  const { textColor, gridColor } = getChartDefaults();
  const trend = analytics.completion_trend;
  charts.trend = new Chart(ctx, {
    type: 'line',
    data: {
      labels: trend.map(d => d.date.slice(5)),
      datasets: [{ label: 'Topics Completed', data: trend.map(d => d.completed_topics), borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.1)', tension: 0.4, fill: true, pointRadius: 0, borderWidth: 2 }],
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor, maxTicksLimit: 10 }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true },
      },
    },
  });
}

function renderHeatmap(streaks) {
  const container = document.getElementById('heatmap');
  if (!container || !streaks?.heatmap) return;

  document.getElementById('streak-current').textContent = streaks.current_streak;
  document.getElementById('streak-longest').textContent = streaks.longest_streak;
  document.getElementById('streak-days').textContent = streaks.total_study_days;

  container.innerHTML = '';
  streaks.heatmap.forEach(d => {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    cell.setAttribute('data-studied', d.studied);
    cell.setAttribute('title', `${d.date}: ${d.hours}h studied`);
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `${d.date}: ${d.studied ? d.hours + ' hours studied' : 'No study'}`);
    cell.setAttribute('tabindex', '0');
    if (d.studied) {
      cell.setAttribute('data-hours', d.hours >= 3 ? 'high' : d.hours >= 1 ? 'med' : 'low');
    }
    container.appendChild(cell);
  });
}

function renderSubjectReadiness(subjects) {
  const container = document.getElementById('subject-readiness');
  if (!subjects?.length) { container.innerHTML = '<div class="text-muted text-sm text-center p-4">No subjects yet</div>'; return; }
  container.innerHTML = subjects.map(s => `
    <div class="flex items-center gap-4 mb-4 pb-4" style="border-bottom:1px solid var(--border-subtle)" role="listitem">
      <div style="width:12px;height:12px;border-radius:50%;background:${s.subject_color};flex-shrink:0" aria-hidden="true"></div>
      <div style="flex:1;min-width:0">
        <div class="flex justify-between mb-1">
          <span class="text-sm font-medium" style="color:var(--text-primary)">${s.subject_name}</span>
          <span class="text-xs text-muted">${s.days_to_exam != null ? s.days_to_exam + 'd to exam' : 'No exam'}</span>
        </div>
        <div class="progress-bar sm" role="progressbar" aria-valuenow="${s.readiness_score}" aria-valuemin="0" aria-valuemax="100" aria-label="${s.subject_name} readiness">
          <div class="progress-fill" style="width:${s.readiness_score}%;background:${s.subject_color}"></div>
        </div>
        <div class="text-xs text-muted mt-1">${s.study_hours}h studied · ${s.completed_topics}/${s.total_topics} topics · ${s.readiness_score}% ready</div>
      </div>
    </div>
  `).join('');
}

if (requireAuth()) {
  loadAll();

  // Redraw charts when theme changes
  const observer = new MutationObserver(() => {
    Object.values(charts).forEach(c => c.destroy());
    charts = {};
    loadAll();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
}

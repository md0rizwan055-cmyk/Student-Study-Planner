/**
 * focus.js — Focus Mode timer with session tracking and feedback
 */
import { initTheme, requireAuth, toast, todayISO, formatTime, sessionChip, navigateTo } from '../js/app.js';
import api from '../js/api.js';

initTheme();
requireAuth();

let timerInterval = null;
let totalSeconds = 45 * 60;
let remainingSeconds = totalSeconds;
let isPaused = false;
let currentSessionId = null;
let selectedRating = null;
const CIRCUMFERENCE = 2 * Math.PI * 108; // r=108

// Load sessions for selector
async function loadSessions() {
  try {
    const timetable = await api.getTimetable(todayISO());
    const select = document.getElementById('session-select');
    const sessions = (timetable?.sessions || []).filter(s => s.status === 'scheduled');

    if (!sessions.length) {
      select.innerHTML = '<option value="">No sessions scheduled today</option>';
      return;
    }

    select.innerHTML = '<option value="">— Choose a session (optional) —</option>' +
      sessions.map(s => `<option value="${s.id}" data-topic="${s.topic_name}" data-subject="${s.subject_name}" data-color="${s.subject_color}" data-type="${s.session_type}" data-duration="${s.duration_minutes}">
        ${formatTime(s.start_time)} · ${s.topic_name} (${s.subject_name}) · ${s.duration_minutes}min
      </option>`).join('');

    // Check URL param for auto-select
    const params = new URLSearchParams(window.location.search);
    const sessionParam = params.get('session');
    if (sessionParam) {
      select.value = sessionParam;
      select.dispatchEvent(new Event('change'));
    }
  } catch {}
}

document.getElementById('session-select')?.addEventListener('change', e => {
  const opt = e.target.options[e.target.selectedIndex];
  if (opt.value && opt.dataset.duration) {
    document.getElementById('duration-select').value = opt.dataset.duration;
  }
});

if (requireAuth()) {
  loadSessions();
}

// Start focus
document.getElementById('start-focus-btn')?.addEventListener('click', () => {
  const select = document.getElementById('session-select');
  const durationSelect = document.getElementById('duration-select');
  const duration = parseInt(durationSelect.value);
  totalSeconds = duration * 60;
  remainingSeconds = totalSeconds;

  const opt = select.options[select.selectedIndex];
  currentSessionId = opt.value || null;

  // Update display
  document.getElementById('focus-topic').textContent = opt.value ? opt.dataset.topic : 'Free Study Session';
  document.getElementById('focus-subject-color').style.background = opt.value ? opt.dataset.color : 'var(--primary)';
  document.getElementById('focus-type').textContent = opt.value ? sessionChip(opt.dataset.type) : '⏱ Focus Session';

  document.getElementById('setup-panel').classList.add('hidden');
  document.getElementById('timer-panel').classList.remove('hidden');

  startTimer();
});

function startTimer() {
  updateDisplay();
  timerInterval = setInterval(() => {
    if (!isPaused) {
      remainingSeconds--;
      updateDisplay();
      if (remainingSeconds <= 0) { clearInterval(timerInterval); onTimerComplete(); }
    }
  }, 1000);
}

function updateDisplay() {
  const m = Math.floor(remainingSeconds / 60).toString().padStart(2, '0');
  const s = (remainingSeconds % 60).toString().padStart(2, '0');
  document.getElementById('timer-display').textContent = `${m}:${s}`;

  // Update ring
  const ring = document.getElementById('timer-ring-el');
  if (ring) {
    const progress = remainingSeconds / totalSeconds;
    const offset = CIRCUMFERENCE * (1 - progress);
    ring.style.strokeDasharray = CIRCUMFERENCE;
    ring.style.strokeDashoffset = offset;

    // Color shifts to orange/red as time runs low
    if (progress < 0.25) ring.style.stroke = '#ef4444';
    else if (progress < 0.5) ring.style.stroke = '#f59e0b';
  }

  // Progress text
  const elapsed = totalSeconds - remainingSeconds;
  const elapsedMin = Math.floor(elapsed / 60);
  document.getElementById('session-progress-text').textContent =
    `${elapsedMin} min studied · ${Math.round((elapsed / totalSeconds) * 100)}% complete`;

  // Update aria label
  document.querySelector('.timer-ring').setAttribute('aria-label', `${m} minutes ${s} seconds remaining`);
}

document.getElementById('pause-btn')?.addEventListener('click', () => {
  isPaused = !isPaused;
  const btn = document.getElementById('pause-btn');
  btn.textContent = isPaused ? '▶' : '⏸';
  btn.setAttribute('aria-label', isPaused ? 'Resume timer' : 'Pause timer');
  document.getElementById('timer-state-label').textContent = isPaused ? 'Paused' : 'Focus';
});

document.getElementById('complete-btn')?.addEventListener('click', () => {
  clearInterval(timerInterval);
  onTimerComplete();
});

document.getElementById('abandon-btn')?.addEventListener('click', () => {
  clearInterval(timerInterval);
  document.getElementById('timer-panel').classList.add('hidden');
  document.getElementById('setup-panel').classList.remove('hidden');
  currentSessionId = null;
  toast.info('Session abandoned', 'No progress was recorded.');
});

async function onTimerComplete() {
  if (currentSessionId) {
    try { await api.completeSession(currentSessionId); } catch {}
  }
  document.getElementById('timer-panel').classList.add('hidden');
  document.getElementById('feedback-panel').classList.remove('hidden');

  // Play a completion sound via oscillator (no external resources)
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.setValueAtTime(554, ctx.currentTime + 0.1);
    osc.frequency.setValueAtTime(659, ctx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch {}
}

// Feedback
document.querySelectorAll('.feedback-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.feedback-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedRating = btn.dataset.rating;
  });
});

async function submitFeedback(rating) {
  if (currentSessionId && rating) {
    try {
      await api.submitFeedback(currentSessionId, {
        rating,
        notes: document.getElementById('feedback-notes')?.value || null,
        actual_duration_minutes: Math.ceil((totalSeconds - remainingSeconds) / 60),
      });
    } catch {}
  }
  toast.success('Great work! 🎉', 'Session recorded. Keep up the momentum!');
  setTimeout(() => { navigateTo('/dashboard/index.html'); }, 1200);
}

document.getElementById('submit-feedback-btn')?.addEventListener('click', () => {
  submitFeedback(selectedRating || 'neutral');
});

document.getElementById('skip-feedback-btn')?.addEventListener('click', () => {
  submitFeedback(null);
});

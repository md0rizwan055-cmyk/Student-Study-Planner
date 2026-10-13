/**
 * dashboard-focus.js — Focus Mode Timer & Feedback Panel for Dashboard
 */
import { formatTime, sessionChip, toast } from './app.js';
import api from './api.js';

export function createFocusModule({ onSessionCompleted, onSessionUpdated }) {
  let timerInterval = null;
  let totalSeconds = 45 * 60;
  let remainingSeconds = totalSeconds;
  let isPaused = false;
  let currentSessionId = null;
  let selectedRating = null;
  const CIRCUMFERENCE = 2 * Math.PI * 108; // r=108

  const setupPanel = document.getElementById('focus-setup-panel');
  const timerPanel = document.getElementById('focus-timer-panel');
  const feedbackPanel = document.getElementById('focus-feedback-panel');
  const sessionSelect = document.getElementById('focus-session-select');
  const durationSelect = document.getElementById('focus-duration-select');
  const startBtn = document.getElementById('focus-start-btn');
  const pauseBtn = document.getElementById('focus-pause-btn');
  const completeBtn = document.getElementById('focus-complete-btn');
  const abandonBtn = document.getElementById('focus-abandon-btn');
  const timerDisplay = document.getElementById('focus-timer-display');
  const timerRing = document.getElementById('focus-timer-ring-el');
  const timerStateLabel = document.getElementById('focus-timer-state-label');
  const focusTopic = document.getElementById('focus-topic');
  const focusColor = document.getElementById('focus-subject-color');
  const focusType = document.getElementById('focus-type');
  const progressText = document.getElementById('focus-progress-text');
  const feedbackNotes = document.getElementById('focus-feedback-notes');
  const submitFeedbackBtn = document.getElementById('focus-submit-feedback-btn');
  const skipFeedbackBtn = document.getElementById('focus-skip-feedback-btn');

  // Populate session select
  async function loadSessions(sessions = null, preSelectId = null) {
    if (!sessionSelect) return;
    try {
      let scheduled = [];
      if (sessions && Array.isArray(sessions)) {
        scheduled = sessions.filter(s => s.status === 'scheduled');
      } else {
        const todayDate = todayISO();
        const timetable = await api.getTimetable(todayDate);
        scheduled = (timetable?.sessions || []).filter(s => s.status === 'scheduled');
      }

      if (!scheduled.length) {
        sessionSelect.innerHTML = '<option value="">— Free Study (No scheduled sessions) —</option>';
      } else {
        sessionSelect.innerHTML = '<option value="">— Choose a session or Free Study —</option>' +
          scheduled.map(s => `
            <option value="${s.id}" data-topic="${s.topic_name}" data-subject="${s.subject_name}" data-color="${s.subject_color}" data-type="${s.session_type}" data-duration="${s.duration_minutes}">
              ${formatTime(s.start_time)} · ${s.topic_name} (${s.subject_name}) · ${s.duration_minutes}m
            </option>
          `).join('');
      }

      if (preSelectId) {
        selectSession(preSelectId, false);
      }
    } catch (e) {
      console.error('Focus session load failed', e);
    }
  }

  // Pre-fill / select session
  function selectSession(sessionId, autoStart = false) {
    if (!sessionId) return;
    currentSessionId = sessionId;

    // Check if session option exists in select
    if (sessionSelect) {
      sessionSelect.value = sessionId;
      const opt = sessionSelect.options[sessionSelect.selectedIndex];
      if (opt && opt.value) {
        if (opt.dataset.duration && durationSelect) {
          durationSelect.value = opt.dataset.duration;
        }
      }
    }

    if (autoStart) {
      startSessionFromId(sessionId);
    } else {
      // Scroll smoothly to focus panel
      const focusCard = document.getElementById('focus-timer-card');
      if (focusCard) {
        focusCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }

  async function startSessionFromId(sessionId) {
    let sessionData = null;
    try {
      const todayDate = todayISO();
      const tt = await api.getTimetable(todayDate);
      sessionData = tt?.sessions?.find(s => s.id === sessionId);
    } catch (e) {}

    const duration = sessionData?.duration_minutes || (durationSelect ? parseInt(durationSelect.value) : 45) || 45;
    totalSeconds = duration * 60;
    remainingSeconds = totalSeconds;
    currentSessionId = sessionId;

    if (focusTopic) focusTopic.textContent = sessionData?.topic_name || 'Study Session';
    if (focusColor) focusColor.style.background = sessionData?.subject_color || 'var(--primary)';
    if (focusType) focusType.textContent = sessionData ? sessionChip(sessionData.session_type) : '⏱ Focus Session';

    setupPanel?.classList.add('hidden');
    feedbackPanel?.classList.add('hidden');
    timerPanel?.classList.remove('hidden');

    const focusCard = document.getElementById('focus-timer-card');
    if (focusCard) {
      focusCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    startTimer();
  }

  function startTimer() {
    clearInterval(timerInterval);
    isPaused = false;
    if (pauseBtn) {
      pauseBtn.textContent = '⏸';
      pauseBtn.setAttribute('aria-label', 'Pause timer');
    }
    if (timerStateLabel) timerStateLabel.textContent = 'Focus';
    updateDisplay();

    timerInterval = setInterval(() => {
      if (!isPaused) {
        remainingSeconds--;
        updateDisplay();
        if (remainingSeconds <= 0) {
          clearInterval(timerInterval);
          onTimerComplete();
        }
      }
    }, 1000);
  }

  function updateDisplay() {
    const m = Math.floor(Math.max(0, remainingSeconds) / 60).toString().padStart(2, '0');
    const s = (Math.max(0, remainingSeconds) % 60).toString().padStart(2, '0');
    if (timerDisplay) timerDisplay.textContent = `${m}:${s}`;

    if (timerRing) {
      const progress = totalSeconds > 0 ? remainingSeconds / totalSeconds : 0;
      const offset = CIRCUMFERENCE * (1 - progress);
      timerRing.style.strokeDasharray = CIRCUMFERENCE;
      timerRing.style.strokeDashoffset = offset;

      if (progress < 0.25) timerRing.style.stroke = '#ef4444';
      else if (progress < 0.5) timerRing.style.stroke = '#f59e0b';
      else timerRing.style.stroke = 'url(#timerGrad)';
    }

    const elapsed = totalSeconds - remainingSeconds;
    const elapsedMin = Math.floor(elapsed / 60);
    if (progressText) {
      progressText.textContent = `${elapsedMin} min studied · ${Math.round((elapsed / Math.max(1, totalSeconds)) * 100)}% complete`;
    }
  }

  function playChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
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
    } catch (e) {}
  }

  async function onTimerComplete() {
    clearInterval(timerInterval);
    playChime();

    if (currentSessionId) {
      try {
        await api.completeSession(currentSessionId);
        if (typeof onSessionCompleted === 'function') {
          onSessionCompleted(currentSessionId);
        }
      } catch (err) {
        console.error('Session complete API call failed', err);
      }
    }

    timerPanel?.classList.add('hidden');
    feedbackPanel?.classList.remove('hidden');
    toast.success('Focus session complete! 🎉', 'Well done! How did it feel?');
  }

  // Event Listeners
  sessionSelect?.addEventListener('change', e => {
    const opt = e.target.options[e.target.selectedIndex];
    if (opt && opt.value && opt.dataset.duration && durationSelect) {
      durationSelect.value = opt.dataset.duration;
    }
  });

  startBtn?.addEventListener('click', () => {
    const opt = sessionSelect?.options[sessionSelect.selectedIndex];
    const duration = durationSelect ? parseInt(durationSelect.value) : 45;
    totalSeconds = duration * 60;
    remainingSeconds = totalSeconds;
    currentSessionId = (opt && opt.value) ? opt.value : null;

    if (focusTopic) focusTopic.textContent = opt?.value ? opt.dataset.topic : 'Free Study Session';
    if (focusColor) focusColor.style.background = opt?.value ? opt.dataset.color : 'var(--primary)';
    if (focusType) focusType.textContent = opt?.value ? sessionChip(opt.dataset.type) : '⏱ Focus Session';

    setupPanel?.classList.add('hidden');
    feedbackPanel?.classList.add('hidden');
    timerPanel?.classList.remove('hidden');

    startTimer();
  });

  pauseBtn?.addEventListener('click', () => {
    isPaused = !isPaused;
    if (pauseBtn) {
      pauseBtn.textContent = isPaused ? '▶' : '⏸';
      pauseBtn.setAttribute('aria-label', isPaused ? 'Resume timer' : 'Pause timer');
    }
    if (timerStateLabel) {
      timerStateLabel.textContent = isPaused ? 'Paused' : 'Focus';
    }
  });

  completeBtn?.addEventListener('click', () => {
    onTimerComplete();
  });

  abandonBtn?.addEventListener('click', () => {
    clearInterval(timerInterval);
    timerPanel?.classList.add('hidden');
    feedbackPanel?.classList.add('hidden');
    setupPanel?.classList.remove('hidden');
    currentSessionId = null;
    toast.info('Session abandoned', 'No progress was recorded.');
  });

  document.querySelectorAll('.focus-feedback-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.focus-feedback-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedRating = btn.dataset.rating;
    });
  });

  async function submitFeedback(rating) {
    if (currentSessionId && rating) {
      try {
        await api.submitFeedback(currentSessionId, {
          rating,
          notes: feedbackNotes?.value || null,
          actual_duration_minutes: Math.max(1, Math.ceil((totalSeconds - remainingSeconds) / 60)),
        });
      } catch (e) {}
    }

    if (feedbackNotes) feedbackNotes.value = '';
    document.querySelectorAll('.focus-feedback-btn').forEach(b => b.classList.remove('selected'));
    selectedRating = null;

    feedbackPanel?.classList.add('hidden');
    timerPanel?.classList.add('hidden');
    setupPanel?.classList.remove('hidden');

    toast.success('Session recorded! 🎯', 'Keep up the momentum!');

    if (typeof onSessionUpdated === 'function') {
      onSessionUpdated();
    }
  }

  submitFeedbackBtn?.addEventListener('click', () => {
    submitFeedback(selectedRating || 'neutral');
  });

  skipFeedbackBtn?.addEventListener('click', () => {
    submitFeedback(null);
  });

  return {
    loadSessions,
    selectSession,
    startSessionFromId,
  };
}

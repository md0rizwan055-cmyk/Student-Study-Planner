/**
 * onboarding.js — Multi-step onboarding wizard logic
 */

import { initTheme, toast, requireAuth, navigateTo } from '../js/app.js';
import api, { getUser, setUser } from '../js/api.js';

initTheme();
requireAuth();

const user = getUser();
if (user?.onboarding_complete) {
  navigateTo('/dashboard/index.html');
}

// ── STATE ──────────────────────────────────────────────────────
let currentStep = 1;
const TOTAL_STEPS = 6;

const SUBJECT_COLORS = [
  '#00f5a0','#ffb800','#00f2fe','#10b981','#f59e0b',
  '#ff4757','#38bdf8','#a3e635','#14b8a6','#f97316',
];

const state = {
  // Step 1
  college: '', academic_year: '', board_university: '',
  // Step 2 & 3: subjects and topics nested
  subjects: [
    {
      name: '',
      color: SUBJECT_COLORS[0],
      exam_date: '',
      total_marks: null,
      topics: [],
    }
  ],
  // Step 4
  daily_study_hours: 4,
  preferred_study_time: 'morning',
  break_duration_minutes: 15,
  saturday_available: true,
  sunday_available: true,
  class_timings: [],
  // Step 5
  goals: '',
  existing_commitments: '',
};

// ── NAVIGATION ─────────────────────────────────────────────────
function goToStep(step) {
  // Validate before moving forward
  if (step > currentStep && !validateStep(currentStep)) return;

  document.querySelector(`#step-${currentStep}`)?.classList.remove('active');
  document.querySelector(`#step-${step}`)?.classList.add('active');

  // Update sidebar
  document.querySelectorAll('.step-item').forEach(el => {
    const s = parseInt(el.dataset.step);
    el.classList.remove('active', 'completed');
    if (s === step) el.classList.add('active');
    else if (s < step) el.classList.add('completed');
  });

  // Update step numbers for completed
  document.querySelectorAll('.step-num').forEach(el => {
    const s = parseInt(el.closest('.step-item')?.dataset.step || 0);
    el.textContent = s < step ? '✓' : s;
  });

  // Update progress bar
  const pct = (step / TOTAL_STEPS) * 100;
  const progIndicator = document.getElementById('progress-indicator');
  if (progIndicator) progIndicator.style.width = `${pct}%`;
  document.querySelector('[role="progressbar"]')?.setAttribute('aria-valuenow', step);

  currentStep = step;
  if (step === 3) renderTopicsStep();
  if (step === 6) renderSummary();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Navigation buttons
document.getElementById('next-1')?.addEventListener('click', () => goToStep(2));
document.getElementById('back-2')?.addEventListener('click', () => goToStep(1));
document.getElementById('next-2')?.addEventListener('click', () => goToStep(3));
document.getElementById('back-3')?.addEventListener('click', () => goToStep(2));
document.getElementById('next-3')?.addEventListener('click', () => goToStep(4));
document.getElementById('back-4')?.addEventListener('click', () => goToStep(3));
document.getElementById('next-4')?.addEventListener('click', () => goToStep(5));
document.getElementById('back-5')?.addEventListener('click', () => goToStep(4));
document.getElementById('next-5')?.addEventListener('click', () => goToStep(6));
document.getElementById('back-6')?.addEventListener('click', () => goToStep(5));

// ── VALIDATION ─────────────────────────────────────────────────
function validateStep(step) {
  if (step === 2) {
    const validSubjects = state.subjects.filter(s => s && s.name && s.name.trim());
    if (validSubjects.length === 0) {
      toast.warning('Add Subjects', 'Please enter a name for at least one subject.');
      return false;
    }
  }
  if (step === 3) {
    const validSubjects = state.subjects.filter(s => s && s.name && s.name.trim());
    for (const sub of validSubjects) {
      const validTopics = (sub.topics || []).filter(t => t && t.name && t.name.trim());
      if (validTopics.length === 0) {
        toast.warning('Add Topics', `Please add at least one topic for "${sub.name}".`);
        return false;
      }
    }
  }
  return true;
}

// ── STEP 1 — collect on change ─────────────────────────────────
document.getElementById('college')?.addEventListener('input', e => { state.college = e.target.value; });
document.getElementById('academic-year')?.addEventListener('change', e => { state.academic_year = e.target.value; });
document.getElementById('board')?.addEventListener('input', e => { state.board_university = e.target.value; });

// ── STEP 2 — Subjects ─────────────────────────────────────────
function renderSubjectsList() {
  const list = document.getElementById('subjects-list');
  if (!list) return;
  list.innerHTML = '';

  state.subjects.forEach((sub, index) => {
    const color = sub.color || SUBJECT_COLORS[index % SUBJECT_COLORS.length];
    const row = document.createElement('div');
    row.className = 'subject-row card card-sm';
    row.setAttribute('role', 'listitem');
    row.dataset.index = index;
    row.innerHTML = `
      <div class="form-group">
        <label class="form-label" for="sub-name-${index}">Subject Name</label>
        <input type="text" id="sub-name-${index}" class="form-input" placeholder="e.g. Mathematics"
          value="${sub.name || ''}" aria-required="true">
      </div>
      <div class="form-group">
        <label class="form-label" for="sub-exam-${index}">Exam Date</label>
        <input type="date" id="sub-exam-${index}" class="form-input"
          value="${sub.exam_date || ''}" aria-label="Exam date for this subject">
      </div>
      <div class="form-group">
        <label class="form-label" for="sub-marks-${index}">Total Marks</label>
        <input type="number" id="sub-marks-${index}" class="form-input" placeholder="100"
          value="${sub.total_marks ?? ''}" min="0" max="1000" aria-label="Total marks">
      </div>
      <div style="display:flex;flex-direction:column;gap:8px">
        <label class="form-label">Color</label>
        <div class="flex gap-2" style="flex-wrap:wrap">
          ${SUBJECT_COLORS.slice(0, 5).map(c =>
            `<div class="color-swatch${c === color ? ' selected' : ''}"
              style="background:${c}" data-color="${c}" data-idx="${index}"
              role="button" tabindex="0" aria-label="Subject color ${c}"
              title="Color ${c}"></div>`
          ).join('')}
          <button class="btn btn-icon remove-subject-btn" data-remove="${index}" style="background:var(--danger-bg);color:var(--danger)"
            aria-label="Remove subject" ${state.subjects.length <= 1 ? 'disabled style="opacity:0.4;cursor:not-allowed"' : ''}>✕</button>
        </div>
      </div>
    `;

    list.appendChild(row);

    // Events
    row.querySelector(`#sub-name-${index}`)?.addEventListener('input', e => {
      state.subjects[index].name = e.target.value;
    });
    row.querySelector(`#sub-exam-${index}`)?.addEventListener('change', e => {
      state.subjects[index].exam_date = e.target.value;
    });
    row.querySelector(`#sub-marks-${index}`)?.addEventListener('input', e => {
      const val = parseInt(e.target.value, 10);
      state.subjects[index].total_marks = isNaN(val) ? null : val;
    });
    row.querySelectorAll('.color-swatch').forEach(swatch => {
      const handler = () => {
        state.subjects[index].color = swatch.dataset.color;
        row.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        swatch.classList.add('selected');
      };
      swatch.addEventListener('click', handler);
      swatch.addEventListener('keydown', e => e.key === 'Enter' && handler());
    });
    row.querySelector(`[data-remove="${index}"]`)?.addEventListener('click', () => {
      if (state.subjects.length > 1) {
        state.subjects.splice(index, 1);
        renderSubjectsList();
      }
    });
  });
}

document.getElementById('add-subject-btn')?.addEventListener('click', () => {
  const nextIdx = state.subjects.length;
  state.subjects.push({
    name: '',
    color: SUBJECT_COLORS[nextIdx % SUBJECT_COLORS.length],
    exam_date: '',
    total_marks: null,
    topics: [],
  });
  renderSubjectsList();
});

renderSubjectsList();

// ── STEP 3 — Topics ───────────────────────────────────────────
function renderTopicsStep() {
  const container = document.getElementById('topics-container');
  if (!container) return;
  container.innerHTML = '';

  const activeSubjects = state.subjects.filter(s => s.name && s.name.trim());
  if (activeSubjects.length === 0) {
    container.innerHTML = '<div class="p-6 text-center text-muted">No subjects found. Please go back to Step 2 and add subjects.</div>';
    return;
  }

  state.subjects.forEach((subject, sIdx) => {
    if (!subject.name || !subject.name.trim()) return;
    subject.topics = subject.topics || [];

    // Ensure at least one default topic slot if empty
    if (subject.topics.length === 0) {
      subject.topics.push({ name: '', difficulty: 3, importance: 3, estimated_hours: 2, current_progress: 0 });
    }

    const group = document.createElement('div');
    group.className = 'subject-topics-group';
    group.setAttribute('role', 'listitem');
    group.innerHTML = `
      <div class="subject-header">
        <div style="width:12px;height:12px;border-radius:3px;background:${subject.color || '#00f5a0'};flex-shrink:0"></div>
        <span class="font-semibold" style="color:var(--text-primary)">${subject.name}</span>
        <button class="btn btn-secondary btn-sm ml-auto add-topic-btn" data-subject="${sIdx}"
          aria-label="Add topic to ${subject.name}">+ Add Topic</button>
      </div>
      <div class="topics-list" id="topics-${sIdx}"></div>
    `;
    container.appendChild(group);

    const tList = group.querySelector('.topics-list');
    subject.topics.forEach((topic, tIdx) => {
      addTopicRow(tList, subject, sIdx, tIdx, topic);
    });

    group.querySelector('.add-topic-btn')?.addEventListener('click', () => {
      const newTopic = { name: '', difficulty: 3, importance: 3, estimated_hours: 2, current_progress: 0 };
      subject.topics.push(newTopic);
      addTopicRow(tList, subject, sIdx, subject.topics.length - 1, newTopic);
    });
  });
}

function addTopicRow(container, subject, sIdx, tIdx, topic) {
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'topic-row';
  row.setAttribute('role', 'listitem');
  row.innerHTML = `
    <div class="form-group">
      <input type="text" class="form-input topic-name-input" placeholder="Topic name" value="${topic.name || ''}"
        aria-label="Topic name" aria-required="true">
    </div>
    <div class="form-group">
      <select class="form-input form-select topic-diff-select" aria-label="Difficulty">
        ${[1,2,3,4,5].map(n => `<option value="${n}" ${topic.difficulty === n ? 'selected' : ''}>${n} - ${'★'.repeat(n)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <select class="form-input form-select topic-imp-select" aria-label="Importance">
        ${[1,2,3,4,5].map(n => `<option value="${n}" ${topic.importance === n ? 'selected' : ''}>${n === 5 ? '🔴 Critical' : n === 4 ? '🟠 High' : n === 3 ? '🟡 Medium' : n === 2 ? '🟢 Low' : '⚪ Very Low'}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <input type="number" class="form-input topic-hrs-input" placeholder="Hours" value="${topic.estimated_hours ?? 2}"
        min="0.5" max="50" step="0.5" aria-label="Estimated hours">
    </div>
    <button class="btn btn-icon remove-topic-btn"
      style="background:var(--danger-bg);color:var(--danger);margin-top:auto"
      aria-label="Remove topic">✕</button>
  `;
  container.appendChild(row);

  const nameInput = row.querySelector('.topic-name-input');
  const diffSelect = row.querySelector('.topic-diff-select');
  const impSelect = row.querySelector('.topic-imp-select');
  const hrsInput = row.querySelector('.topic-hrs-input');

  nameInput?.addEventListener('input', e => { topic.name = e.target.value; });
  diffSelect?.addEventListener('change', e => { topic.difficulty = parseInt(e.target.value, 10); });
  impSelect?.addEventListener('change', e => { topic.importance = parseInt(e.target.value, 10); });
  hrsInput?.addEventListener('input', e => {
    const val = parseFloat(e.target.value);
    topic.estimated_hours = isNaN(val) ? 2.0 : val;
  });

  row.querySelector('.remove-topic-btn')?.addEventListener('click', () => {
    const idx = subject.topics.indexOf(topic);
    if (idx !== -1) subject.topics.splice(idx, 1);
    row.remove();
  });
}

// ── STEP 4 — Schedule ─────────────────────────────────────────
const dailyHoursInput = document.getElementById('daily-hours');
const hoursDisplay = document.getElementById('hours-display');
if (dailyHoursInput) {
  dailyHoursInput.addEventListener('input', e => {
    state.daily_study_hours = parseFloat(e.target.value);
    if (hoursDisplay) hoursDisplay.textContent = e.target.value;
    e.target.setAttribute('aria-valuenow', e.target.value);
  });
}
document.getElementById('study-time')?.addEventListener('change', e => { state.preferred_study_time = e.target.value; });
document.getElementById('break-duration')?.addEventListener('change', e => { state.break_duration_minutes = parseInt(e.target.value, 10); });
document.getElementById('saturday')?.addEventListener('change', e => { state.saturday_available = e.target.checked; });
document.getElementById('sunday')?.addEventListener('change', e => { state.sunday_available = e.target.checked; });

// Class timings
document.getElementById('add-timing')?.addEventListener('click', () => {
  addTimingRow();
});

function addTimingRow() {
  const container = document.getElementById('class-timings');
  if (!container) return;
  const timingObj = { day: 'monday', start_time: '09:00', end_time: '17:00' };
  state.class_timings.push(timingObj);

  const row = document.createElement('div');
  row.className = 'timing-row';
  row.setAttribute('role', 'listitem');
  row.innerHTML = `
    <div class="form-group">
      <label class="form-label">Day</label>
      <select class="form-input form-select timing-day" aria-label="Day of week">
        ${['monday','tuesday','wednesday','thursday','friday','saturday','sunday']
          .map(d => `<option value="${d}">${d.charAt(0).toUpperCase()+d.slice(1)}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Start Time</label>
      <input type="time" class="form-input timing-start" value="${timingObj.start_time}" aria-label="Start time">
    </div>
    <div class="form-group">
      <label class="form-label">End Time</label>
      <input type="time" class="form-input timing-end" value="${timingObj.end_time}" aria-label="End time">
    </div>
    <button class="btn btn-icon remove-timing" style="background:var(--danger-bg);color:var(--danger);margin-top:auto"
      aria-label="Remove timing">✕</button>
  `;
  container.appendChild(row);

  row.querySelector('.timing-day')?.addEventListener('change', e => { timingObj.day = e.target.value; });
  row.querySelector('.timing-start')?.addEventListener('change', e => { timingObj.start_time = e.target.value; });
  row.querySelector('.timing-end')?.addEventListener('change', e => { timingObj.end_time = e.target.value; });
  row.querySelector('.remove-timing')?.addEventListener('click', () => {
    const idx = state.class_timings.indexOf(timingObj);
    if (idx !== -1) state.class_timings.splice(idx, 1);
    row.remove();
  });
}

// ── STEP 5 — Goals ────────────────────────────────────────────
document.getElementById('goals')?.addEventListener('input', e => { state.goals = e.target.value; });
document.getElementById('commitments')?.addEventListener('input', e => { state.existing_commitments = e.target.value; });

// ── STEP 6 — Summary & Generate ──────────────────────────────
function renderSummary() {
  const el = document.getElementById('summary-text');
  if (!el) return;
  const activeSubs = state.subjects.filter(s => s && s.name && s.name.trim());
  const totalTopics = activeSubs.reduce((acc, s) => acc + (s.topics ? s.topics.filter(t => t.name && t.name.trim()).length : 0), 0);

  el.innerHTML = `
    <div style="display:grid;gap:8px">
      ${state.college ? `<div>🏫 <strong>College:</strong> ${state.college}</div>` : ''}
      ${state.academic_year ? `<div>📅 <strong>Year:</strong> ${state.academic_year}</div>` : ''}
      <div>📚 <strong>Subjects:</strong> ${activeSubs.length} subjects</div>
      <div>🗂️ <strong>Topics:</strong> ${totalTopics} topics across all subjects</div>
      <div>⏰ <strong>Daily Study:</strong> ${state.daily_study_hours} hours/day</div>
      <div>🕐 <strong>Preferred Time:</strong> ${state.preferred_study_time}</div>
      <div>☕ <strong>Break Duration:</strong> ${state.break_duration_minutes} minutes</div>
      <div>📅 <strong>Weekends:</strong> ${[state.saturday_available && 'Saturday', state.sunday_available && 'Sunday'].filter(Boolean).join(', ') || 'No weekend study'}</div>
      ${state.class_timings.length > 0 ? `<div>🏫 <strong>Blocked Slots:</strong> ${state.class_timings.length} class timing(s)</div>` : ''}
    </div>
  `;
}

// ── GENERATE PLAN ─────────────────────────────────────────────
document.getElementById('generate-btn')?.addEventListener('click', async () => {
  const genText = document.getElementById('gen-text');
  const genSpinner = document.getElementById('gen-spinner');
  const btn = document.getElementById('generate-btn');

  btn.disabled = true;
  genText?.classList.add('hidden');
  genSpinner?.classList.remove('hidden');

  try {
    // 1. Complete onboarding
    await api.completeOnboarding({
      college: state.college || null,
      academic_year: state.academic_year || null,
      board_university: state.board_university || null,
      goals: state.goals || null,
      existing_commitments: state.existing_commitments || null,
      class_timings: state.class_timings,
      preferences: {
        daily_study_hours: state.daily_study_hours,
        preferred_study_time: state.preferred_study_time,
        break_duration_minutes: state.break_duration_minutes,
        weekend_study: state.saturday_available || state.sunday_available,
        saturday_available: state.saturday_available,
        sunday_available: state.sunday_available,
        notification_enabled: true,
        exam_reminder_days: 7,
        theme: 'system',
      },
    });

    // 2. Create subjects & topics
    const activeSubjects = state.subjects.filter(s => s && s.name && s.name.trim());
    for (const sub of activeSubjects) {
      const created = await api.createSubject({
        name: sub.name.trim(),
        color: sub.color || '#00f5a0',
        exam_date: sub.exam_date || null,
        total_marks: sub.total_marks || null,
      });

      const validTopics = (sub.topics || []).filter(t => t && t.name && t.name.trim());
      for (const t of validTopics) {
        await api.createTopic({
          subject_id: created.id,
          name: t.name.trim(),
          difficulty: t.difficulty || 3,
          importance: t.importance || 3,
          estimated_hours: t.estimated_hours || 2,
          current_progress: 0,
        });
      }
    }

    // 3. Generate AI plan
    await api.generatePlan(false);

    // 4. Update user state
    const userData = getUser();
    if (userData) {
      userData.onboarding_complete = true;
      setUser(userData);
    }

    toast.success('🎉 Plan Generated!', 'Your personalized study timetable is ready!');
    setTimeout(() => { navigateTo('/dashboard/index.html'); }, 1000);

  } catch (err) {
    toast.error('Generation Failed', err.message || 'Please try again');
    btn.disabled = false;
    genText?.classList.remove('hidden');
    genSpinner?.classList.add('hidden');
  }
});

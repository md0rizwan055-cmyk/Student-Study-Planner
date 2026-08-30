/**
 * subjects.js — Subject and Topic management CRUD
 */
import { initTheme, requireAuth, toast, renderStars, sessionChip, statusBadge, confirmDialog, debounce } from '../js/app.js';
import api from '../js/api.js';

initTheme();
requireAuth();

let subjects = [];
let allTopics = {};
let editingSubjectId = null;
let editingTopicId = null;
let selectedColor = '#00f5a0';

const COLORS = ['#00f5a0','#ffb800','#00f2fe','#10b981','#f59e0b','#ff4757','#38bdf8','#a3e635'];

// ── LOAD DATA ─────────────────────────────────────────────────
async function loadSubjects() {
  const container = document.getElementById('subjects-container');
  try {
    subjects = await api.getSubjects();
    if (!subjects.length) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">📚</div><div class="empty-state-title">No subjects yet</div><div class="empty-state-text">Add your first subject to get started.</div><button class="btn btn-primary mt-4" id="first-add-btn">+ Add Subject</button></div>`;
      document.getElementById('first-add-btn')?.addEventListener('click', openSubjectModal);
      return;
    }

    // Load all topics
    await Promise.all(subjects.map(async s => {
      try { allTopics[s.id] = await api.getTopics(s.id); }
      catch { allTopics[s.id] = []; }
    }));

    renderSubjects(subjects);
  } catch (err) {
    toast.error('Load failed', err.message);
    container.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-text">Failed to load subjects. <button class="btn btn-secondary btn-sm" onclick="location.reload()">Retry</button></div></div>`;
  }
}

function renderSubjects(list) {
  const container = document.getElementById('subjects-container');
  container.innerHTML = '';
  list.forEach((s, idx) => {
    const topics = allTopics[s.id] || [];
    const card = document.createElement('div');
    card.className = 'subject-card animate-fade-up';
    card.style.animationDelay = `${idx * 60}ms`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `${s.name} subject`);
    card.innerHTML = `
      <div class="subject-card-header">
        <div class="subject-color-dot" style="background:${s.color}" aria-hidden="true"></div>
        <div style="flex:1;min-width:0">
          <div class="font-semibold" style="color:var(--text-primary)">${s.name}</div>
          <div class="text-xs text-muted">${topics.length} topics · ${s.progress_percent}% complete${s.days_to_exam != null ? ` · ${s.days_to_exam}d to exam` : ''}</div>
        </div>
        <div class="flex gap-2">
          <button class="btn btn-icon edit-subject-btn" data-id="${s.id}" aria-label="Edit ${s.name}">✏️</button>
          <button class="btn btn-icon del-subject-btn" data-id="${s.id}" style="color:var(--danger)" aria-label="Delete ${s.name}">🗑️</button>
        </div>
      </div>
      <div class="px-5 pb-3">
        <div class="progress-bar sm" role="progressbar" aria-valuenow="${s.progress_percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${s.name} progress">
          <div class="progress-fill" style="width:${s.progress_percent}%;background:${s.color};transition:width 1s ease"></div>
        </div>
        ${s.exam_date ? `<div class="text-xs text-muted mt-2">📅 Exam: ${s.exam_date}</div>` : ''}
      </div>
      <div class="topics-list" role="list" aria-label="Topics for ${s.name}">
        ${topics.slice(0, 5).map(t => `
          <div class="topic-item" role="listitem">
            <div class="topic-info">
              <div class="topic-name">${t.name}</div>
              <div class="topic-meta">${renderStars(t.difficulty)} · ${t.estimated_hours}h · ${t.current_progress}%</div>
            </div>
            <div class="flex gap-1">
              ${statusBadge(t.status)}
              <button class="btn btn-icon" style="width:28px;height:28px;font-size:11px" data-edit-topic="${t.id}" data-subject="${s.id}" aria-label="Edit topic ${t.name}">✏️</button>
              <button class="btn btn-icon" style="width:28px;height:28px;font-size:11px;color:var(--danger)" data-del-topic="${t.id}" aria-label="Delete topic ${t.name}">✕</button>
            </div>
          </div>
        `).join('')}
        ${topics.length > 5 ? `<div class="p-3 text-center text-xs text-muted">+${topics.length - 5} more topics</div>` : ''}
      </div>
      <div class="px-5 pb-5 pt-3">
        <button class="btn btn-secondary w-full add-topic-btn" data-subject="${s.id}" aria-label="Add topic to ${s.name}">+ Add Topic</button>
      </div>
    `;
    container.appendChild(card);
  });

  // Event delegation
  container.addEventListener('click', handleContainerClick);
}

async function handleContainerClick(e) {
  const editSubj = e.target.closest('.edit-subject-btn');
  const delSubj = e.target.closest('.del-subject-btn');
  const addTopic = e.target.closest('.add-topic-btn');
  const editTopic = e.target.closest('[data-edit-topic]');
  const delTopic = e.target.closest('[data-del-topic]');

  if (editSubj) { openSubjectModal(editSubj.dataset.id); }
  if (delSubj) { confirmDialog('Delete Subject?', 'This will delete the subject and ALL its topics.', () => deleteSubject(delSubj.dataset.id)); }
  if (addTopic) { openTopicModal(addTopic.dataset.subject); }
  if (editTopic) { openTopicModal(editTopic.dataset.subject, editTopic.dataset.editTopic); }
  if (delTopic) { confirmDialog('Delete Topic?', 'Are you sure?', () => deleteTopic(delTopic.dataset.delTopic)); }
}

// ── SUBJECT MODAL ─────────────────────────────────────────────
function openSubjectModal(editId = null) {
  editingSubjectId = editId;
  const modal = document.getElementById('subject-modal');
  const title = document.getElementById('subject-modal-title');
  title.textContent = editId ? 'Edit Subject' : 'Add Subject';

  if (editId) {
    const s = subjects.find(s => s.id === editId);
    if (s) {
      document.getElementById('s-name').value = s.name;
      document.getElementById('s-exam').value = s.exam_date || '';
      document.getElementById('s-marks').value = s.total_marks || '';
      selectedColor = s.color;
      updateColorPicker(s.color);
    }
  } else {
    document.getElementById('subject-form').reset();
    selectedColor = '#00f5a0';
    updateColorPicker('#00f5a0');
  }
  modal.classList.remove('hidden');
  document.getElementById('s-name').focus();
}

function updateColorPicker(color) {
  document.querySelectorAll('#color-picker .color-swatch').forEach(s => {
    s.classList.toggle('selected', s.dataset.color === color);
  });
}

document.getElementById('color-picker')?.addEventListener('click', e => {
  const swatch = e.target.closest('.color-swatch');
  if (swatch) { selectedColor = swatch.dataset.color; updateColorPicker(selectedColor); }
});

document.getElementById('add-subject-btn')?.addEventListener('click', () => openSubjectModal());
document.getElementById('close-subject-modal')?.addEventListener('click', () => document.getElementById('subject-modal').classList.add('hidden'));
document.getElementById('cancel-subject')?.addEventListener('click', () => document.getElementById('subject-modal').classList.add('hidden'));

document.getElementById('subject-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const name = document.getElementById('s-name').value.trim();
  if (!name) return;
  const data = {
    name, color: selectedColor,
    exam_date: document.getElementById('s-exam').value || null,
    total_marks: parseInt(document.getElementById('s-marks').value) || null,
  };
  try {
    document.getElementById('save-subject-btn').disabled = true;
    if (editingSubjectId) await api.updateSubject(editingSubjectId, data);
    else await api.createSubject(data);
    document.getElementById('subject-modal').classList.add('hidden');
    toast.success('Saved!', `Subject "${name}" ${editingSubjectId ? 'updated' : 'added'}.`);
    await loadSubjects();
  } catch (err) { toast.error('Save failed', err.message); }
  finally { document.getElementById('save-subject-btn').disabled = false; }
});

async function deleteSubject(id) {
  try {
    await api.deleteSubject(id);
    toast.success('Deleted', 'Subject and topics removed.');
    await loadSubjects();
  } catch (err) { toast.error('Delete failed', err.message); }
}

// ── TOPIC MODAL ────────────────────────────────────────────────
function openTopicModal(subjectId, editTopicId = null) {
  editingTopicId = editTopicId;
  document.getElementById('t-subject-id').value = subjectId;
  document.getElementById('t-topic-id').value = editTopicId || '';
  document.getElementById('topic-modal-title').textContent = editTopicId ? 'Edit Topic' : 'Add Topic';

  if (editTopicId) {
    const t = allTopics[subjectId]?.find(t => t.id === editTopicId);
    if (t) {
      document.getElementById('t-name').value = t.name;
      document.getElementById('t-difficulty').value = t.difficulty;
      document.getElementById('t-importance').value = t.importance;
      document.getElementById('t-hours').value = t.estimated_hours;
      document.getElementById('t-progress').value = t.current_progress;
      document.getElementById('t-notes').value = t.notes || '';
    }
  } else {
    document.getElementById('topic-form').reset();
    document.getElementById('t-difficulty').value = '3';
    document.getElementById('t-importance').value = '3';
    document.getElementById('t-hours').value = '2';
  }
  document.getElementById('topic-modal').classList.remove('hidden');
  document.getElementById('t-name').focus();
}

document.getElementById('close-topic-modal')?.addEventListener('click', () => document.getElementById('topic-modal').classList.add('hidden'));
document.getElementById('cancel-topic')?.addEventListener('click', () => document.getElementById('topic-modal').classList.add('hidden'));

document.getElementById('topic-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const subjectId = document.getElementById('t-subject-id').value;
  const topicId = document.getElementById('t-topic-id').value;
  const name = document.getElementById('t-name').value.trim();
  if (!name) return;
  const data = {
    subject_id: subjectId,
    name,
    difficulty: parseInt(document.getElementById('t-difficulty').value),
    importance: parseInt(document.getElementById('t-importance').value),
    estimated_hours: parseFloat(document.getElementById('t-hours').value) || 2,
    current_progress: parseFloat(document.getElementById('t-progress').value) || 0,
    notes: document.getElementById('t-notes').value || null,
  };
  try {
    document.getElementById('save-topic-btn').disabled = true;
    if (topicId) await api.updateTopic(topicId, data);
    else await api.createTopic(data);
    document.getElementById('topic-modal').classList.add('hidden');
    toast.success('Saved!', `Topic "${name}" ${topicId ? 'updated' : 'added'}.`);
    await loadSubjects();
  } catch (err) { toast.error('Save failed', err.message); }
  finally { document.getElementById('save-topic-btn').disabled = false; }
});

async function deleteTopic(id) {
  try {
    await api.deleteTopic(id);
    toast.success('Deleted', 'Topic removed.');
    await loadSubjects();
  } catch (err) { toast.error('Delete failed', err.message); }
}

// ── SEARCH ────────────────────────────────────────────────────
const searchInput = document.getElementById('search-input');
searchInput?.addEventListener('input', debounce(e => {
  const q = e.target.value.toLowerCase().trim();
  if (!q) { renderSubjects(subjects); return; }
  const filtered = subjects.filter(s =>
    s.name.toLowerCase().includes(q) ||
    (allTopics[s.id] || []).some(t => t.name.toLowerCase().includes(q))
  );
  renderSubjects(filtered);
}, 300));

if (requireAuth()) {
  loadSubjects();
}

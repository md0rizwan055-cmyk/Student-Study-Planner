/**
 * settings.js — Settings page: profile, preferences, theme, notifications
 */
import { initTheme, requireAuth, toast, applyTheme, getTheme, logout, confirmDialog } from '../js/app.js';
import api, { getUser, setUser } from '../js/api.js';

initTheme();
requireAuth();

// ── SETTINGS NAV ─────────────────────────────────────────────
document.querySelectorAll('.settings-nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.settings-nav-item').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected', 'false'); });
    document.querySelectorAll('.settings-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    btn.setAttribute('aria-selected', 'true');
    document.getElementById(`section-${btn.dataset.section}`)?.classList.add('active');
  });
});

// ── LOAD PROFILE ─────────────────────────────────────────────
async function loadProfile() {
  try {
    const profile = await api.getProfile();
    document.getElementById('profile-name').textContent = profile.name;
    document.getElementById('profile-email').textContent = profile.email;
    document.getElementById('profile-avatar').textContent = profile.name?.[0]?.toUpperCase() || 'S';
    document.getElementById('p-name').value = profile.name || '';
    document.getElementById('p-college').value = profile.college || '';
    document.getElementById('p-year').value = profile.academic_year || '';
    document.getElementById('p-board').value = profile.board_university || '';
    document.getElementById('p-goals').value = profile.goals || '';

    // Load preferences
    const prefs = profile.preferences || {};
    const hours = prefs.daily_study_hours || 4;
    document.getElementById('pref-hours').value = hours;
    document.getElementById('pref-hours-display').textContent = hours;
    document.getElementById('pref-time').value = prefs.preferred_study_time || 'morning';
    document.getElementById('pref-break').value = prefs.break_duration_minutes || 15;
    document.getElementById('pref-weekend').checked = prefs.weekend_study !== false;
    document.getElementById('pref-exam-reminder').value = prefs.exam_reminder_days || 7;

    // Notification preferences
    const notif = prefs;
    document.getElementById('notif-browser').checked = notif.notification_enabled !== false;
    document.getElementById('notif-exam').checked = notif.exam_alert !== false;
  } catch (err) {
    toast.error('Load failed', err.message);
  }
}

// ── PROFILE FORM ─────────────────────────────────────────────
document.getElementById('profile-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('save-profile-btn');
  btn.disabled = true; btn.textContent = 'Saving...';
  try {
    const data = {
      name: document.getElementById('p-name').value.trim(),
      college: document.getElementById('p-college').value.trim() || null,
      academic_year: document.getElementById('p-year').value.trim() || null,
      board_university: document.getElementById('p-board').value.trim() || null,
      goals: document.getElementById('p-goals').value.trim() || null,
    };
    const updated = await api.updateProfile(data);
    setUser({ ...getUser(), name: updated.name });
    document.getElementById('profile-name').textContent = updated.name;
    document.getElementById('profile-avatar').textContent = updated.name?.[0]?.toUpperCase() || 'S';
    toast.success('✅ Profile saved!', 'Your profile has been updated.');
  } catch (err) { toast.error('Save failed', err.message); }
  finally { btn.disabled = false; btn.textContent = 'Save Changes'; }
});

// Preferences range display
document.getElementById('pref-hours')?.addEventListener('input', e => {
  document.getElementById('pref-hours-display').textContent = e.target.value;
  e.target.setAttribute('aria-valuenow', e.target.value);
});

// ── PREFERENCES FORM ─────────────────────────────────────────
document.getElementById('preferences-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const prefs = {
      daily_study_hours: parseFloat(document.getElementById('pref-hours').value),
      preferred_study_time: document.getElementById('pref-time').value,
      break_duration_minutes: parseInt(document.getElementById('pref-break').value),
      weekend_study: document.getElementById('pref-weekend').checked,
      saturday_available: document.getElementById('pref-weekend').checked,
      sunday_available: document.getElementById('pref-weekend').checked,
      exam_reminder_days: parseInt(document.getElementById('pref-exam-reminder').value),
    };
    await api.updatePreferences(prefs);
    toast.success('✅ Preferences saved!', 'Your study preferences have been updated.');
  } catch (err) { toast.error('Save failed', err.message); }
});

// ── THEME ─────────────────────────────────────────────────────
function updateThemeButtons() {
  const current = getTheme();
  document.querySelectorAll('[data-theme-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeBtn === current);
  });
}

document.querySelectorAll('[data-theme-btn]').forEach(btn => {
  btn.addEventListener('click', () => {
    applyTheme(btn.dataset.themeBtn);
    updateThemeButtons();
  });
});

updateThemeButtons();

// ── NOTIFICATIONS ─────────────────────────────────────────────
document.getElementById('save-notif-btn')?.addEventListener('click', async () => {
  try {
    await api.updateNotifPreferences({
      notification_enabled: document.getElementById('notif-browser').checked,
      exam_alert: document.getElementById('notif-exam').checked,
    });
    toast.success('✅ Saved!', 'Notification settings updated.');
  } catch (err) { toast.error('Save failed', err.message); }
});

document.getElementById('test-notif-btn')?.addEventListener('click', async () => {
  if ('Notification' in window) {
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      new Notification('StudyAI', { body: '🎓 Notifications are working!', icon: '/favicon.ico' });
      toast.success('Notification sent!', 'Check your browser notifications.');
    } else {
      toast.warning('Permission denied', 'Please allow notifications in your browser settings.');
    }
  }
});

// ── ACCOUNT DANGER ────────────────────────────────────────────
document.getElementById('delete-account-btn')?.addEventListener('click', () => {
  confirmDialog(
    'Delete Account?',
    'This will permanently delete your account, all subjects, topics, study sessions and progress data. This cannot be undone.',
    async () => {
      try {
        await api.deleteAccount();
        toast.success('Account deleted', 'Goodbye! We hope to see you again.');
        setTimeout(logout, 1500);
      } catch (err) { toast.error('Failed', err.message); }
    }
  );
});

if (requireAuth()) {
  loadProfile();
}

/**
 * app.js — Global app initialization, theme management, auth guard,
 * toast notifications, sidebar, modal utilities
 */

import { getToken, getUser, clearToken } from './api.js';

// ── THEME ─────────────────────────────────────────────────────
const THEME_KEY = 'sp_theme';

export function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || 'system';
  applyTheme(saved);
}

export function applyTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  const root = document.documentElement;

  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    root.setAttribute('data-theme', theme);
  }

  // Update toggle buttons if present
  document.querySelectorAll('[data-theme-btn]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.themeBtn === theme);
  });
}

export function getTheme() {
  return localStorage.getItem(THEME_KEY) || 'system';
}

// Listen for system theme changes
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'system') applyTheme('system');
});

// ── ROUTING UTILITIES ─────────────────────────────────────────
export function getRoutePath(path) {
  const isUnderFrontend = window.location.pathname.includes('/frontend/');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return isUnderFrontend ? `/frontend${cleanPath}` : cleanPath;
}

export function navigateTo(path) {
  window.location.href = getRoutePath(path);
}

// ── AUTH GUARD ─────────────────────────────────────────────────
export function requireAuth() {
  const token = getToken();
  if (!token) {
    navigateTo('/auth/login.html');
    return false;
  }
  return true;
}

export function requireNoAuth() {
  const token = getToken();
  if (token) {
    navigateTo('/dashboard/index.html');
    return false;
  }
  return true;
}

export function requireOnboarding() {
  const user = getUser();
  if (user && !user.onboarding_complete) {
    navigateTo('/onboarding/index.html');
    return false;
  }
  return true;
}

export function logout() {
  clearToken();
  navigateTo('/auth/login.html');
}

// ── TOAST ──────────────────────────────────────────────────────
let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('role', 'status');
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

const TOAST_ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ',
};

export function showToast(type, title, message = '', duration = 4000) {
  const container = getToastContainer();
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <div class="toast-icon">${TOAST_ICONS[type] || 'ℹ'}</div>
    <div style="flex:1;min-width:0">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-message">${message}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="Dismiss">&times;</button>
  `;

  toast.querySelector('.toast-close').addEventListener('click', () => dismissToast(toast));
  container.appendChild(toast);

  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }
  return toast;
}

function dismissToast(toast) {
  if (!toast.parentNode) return;
  toast.classList.add('hiding');
  setTimeout(() => toast.parentNode?.removeChild(toast), 300);
}

export const toast = {
  success: (title, msg, dur) => showToast('success', title, msg, dur),
  error: (title, msg, dur) => showToast('error', title, msg, dur),
  warning: (title, msg, dur) => showToast('warning', title, msg, dur),
  info: (title, msg, dur) => showToast('info', title, msg, dur),
};

// ── MODAL ──────────────────────────────────────────────────────
export function createModal(options = {}) {
  const {
    title, content, confirmText = 'Confirm', cancelText = 'Cancel',
    onConfirm, onCancel, size = '', danger = false,
  } = options;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'modal-title');

  overlay.innerHTML = `
    <div class="modal ${size ? `modal-${size}` : ''}">
      <div class="modal-header">
        <h3 class="modal-title" id="modal-title">${title || ''}</h3>
        <button class="btn btn-icon modal-close-btn" aria-label="Close">✕</button>
      </div>
      <div class="modal-body">${content || ''}</div>
      <div class="modal-footer">
        ${cancelText ? `<button class="btn btn-secondary cancel-btn">${cancelText}</button>` : ''}
        ${confirmText ? `<button class="btn ${danger ? 'btn-danger' : 'btn-primary'} confirm-btn">${confirmText}</button>` : ''}
      </div>
    </div>
  `;

  const close = () => {
    overlay.style.opacity = '0';
    setTimeout(() => overlay.parentNode?.removeChild(overlay), 200);
  };

  overlay.querySelector('.modal-close-btn')?.addEventListener('click', () => { close(); onCancel?.(); });
  overlay.querySelector('.cancel-btn')?.addEventListener('click', () => { close(); onCancel?.(); });
  overlay.querySelector('.confirm-btn')?.addEventListener('click', () => { close(); onConfirm?.(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) { close(); onCancel?.(); } });

  // Keyboard
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });

  document.body.appendChild(overlay);
  setTimeout(() => overlay.querySelector('.modal')?.querySelector('button')?.focus(), 50);
  return { overlay, close };
}

export function confirmDialog(title, message, onConfirm) {
  createModal({
    title,
    content: `<p>${message}</p>`,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    danger: true,
    onConfirm,
  });
}

// ── SIDEBAR TOGGLE ─────────────────────────────────────────────
export function initSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const hamburger = document.querySelector('#sidebar-toggle');

  if (!sidebar) return;

  hamburger?.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Close on outside click on mobile
  document.addEventListener('click', (e) => {
    if (window.innerWidth <= 1024 && sidebar.classList.contains('open')) {
      if (!sidebar.contains(e.target) && !hamburger?.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    }
  });

  // Mark active link
  const current = window.location.pathname;
  sidebar.querySelectorAll('.sidebar-item').forEach(item => {
    const href = item.getAttribute('href') || '';
    if (href) {
      const parts = href.replace(/^\.\.\//, '').replace(/^\.\//, '').split('/');
      const section = parts[0] === 'index.html' ? '' : parts[0];
      if (section && current.includes(`/${section}/`)) {
        item.classList.add('active');
      }
    }
  });
}

// ── USER DISPLAY ───────────────────────────────────────────────
export function renderUserInfo() {
  const user = getUser();
  if (!user) return;

  document.querySelectorAll('[data-user-name]').forEach(el => { el.textContent = user.name; });
  document.querySelectorAll('[data-user-email]').forEach(el => { el.textContent = user.email; });
  document.querySelectorAll('[data-user-avatar]').forEach(el => {
    el.textContent = user.name?.[0]?.toUpperCase() || 'S';
  });
}

// ── GREETING ─────────────────────────────────────────────────
export function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good night';
}

// ── DATE UTILS ─────────────────────────────────────────────────
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatTime(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function todayISO() {
  return new Date().toISOString().split('T')[0];
}

export function daysUntil(dateStr) {
  if (!dateStr) return null;
  const target = new Date(dateStr);
  const today = new Date();
  today.setHours(0,0,0,0);
  target.setHours(0,0,0,0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

// ── PROGRESS BAR HELPER ────────────────────────────────────────
export function setProgress(el, percent) {
  if (!el) return;
  el.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

// ── SKELETON HELPERS ───────────────────────────────────────────
export function showSkeleton(container, count = 3, type = 'card') {
  container.innerHTML = Array(count).fill(
    `<div class="skeleton skeleton-${type} animate-pulse" style="margin-bottom:12px"></div>`
  ).join('');
}

// ── STAR RATING ────────────────────────────────────────────────
export function renderStars(rating, max = 5) {
  return Array(max).fill(0).map((_, i) =>
    `<span class="star ${i < rating ? 'filled' : ''}">★</span>`
  ).join('');
}

// ── SESSION TYPE CHIP ──────────────────────────────────────────
export function sessionChip(type) {
  const labels = {
    learning: '📖 Learning',
    practice: '✏️ Practice',
    revision: '🔄 Revision',
    mock_test: '📝 Mock Test',
    assignment: '📋 Assignment',
    buffer: '⏸ Buffer',
  };
  return `<span class="session-chip chip-${type}">${labels[type] || type}</span>`;
}

// ── STATUS BADGE ───────────────────────────────────────────────
export function statusBadge(status) {
  const map = {
    scheduled: ['badge-secondary', '🕐 Scheduled'],
    completed: ['badge-success', '✅ Completed'],
    skipped: ['badge-muted', '⏭ Skipped'],
    missed: ['badge-danger', '❌ Missed'],
    in_progress: ['badge-warning', '⏳ In Progress'],
    not_started: ['badge-muted', '⭕ Not Started'],
    needs_revision: ['badge-warning', '🔄 Needs Revision'],
  };
  const [cls, label] = map[status] || ['badge-muted', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

// ── DEBOUNCE ───────────────────────────────────────────────────
export function debounce(fn, delay = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// ── INIT ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  renderUserInfo();

  // Theme toggle buttons
  document.querySelectorAll('[data-theme-btn]').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.themeBtn));
  });

  // Logout buttons
  document.querySelectorAll('[data-logout]').forEach(btn => {
    btn.addEventListener('click', logout);
  });

  // Sidebar
  initSidebar();
});

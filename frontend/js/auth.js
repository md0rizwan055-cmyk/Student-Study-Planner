/**
 * auth.js — Handles signup, login form logic with full validation
 */

import { initTheme, toast, navigateTo } from '../js/app.js';
import api, { setToken, setUser, getToken, getUser, clearToken } from '../js/api.js';

initTheme();

// Redirect if already logged in with a known user state; otherwise clear stale token
const token = getToken();
const user = getUser();
if (token && user) {
  navigateTo(user.onboarding_complete ? '/dashboard/index.html' : '/onboarding/index.html');
} else if (token && !user) {
  clearToken();
}

// ── SHARED UTILITIES ──────────────────────────────────────────
function showError(fieldId, message) {
  const el = document.getElementById(`${fieldId}-error`);
  const input = document.getElementById(fieldId);
  if (el) { el.textContent = `⚠ ${message}`; el.classList.remove('hidden'); }
  if (input) { input.classList.add('error'); input.setAttribute('aria-invalid', 'true'); }
}

function clearError(fieldId) {
  const el = document.getElementById(`${fieldId}-error`);
  const input = document.getElementById(fieldId);
  if (el) { el.textContent = ''; el.classList.add('hidden'); }
  if (input) { input.classList.remove('error'); input.removeAttribute('aria-invalid'); }
}

function clearAllErrors() {
  ['name', 'email', 'password', 'confirm-password'].forEach(clearError);
  const banner = document.getElementById('error-banner');
  if (banner) { banner.textContent = ''; banner.classList.add('hidden'); }
}

function showGlobalError(message) {
  const banner = document.getElementById('error-banner');
  if (banner) { banner.textContent = `✕ ${message}`; banner.classList.remove('hidden'); }
}

function setLoading(loading) {
  const btn = document.getElementById('submit-btn');
  const text = document.getElementById('btn-text');
  const spinner = document.getElementById('btn-spinner');
  if (btn) btn.disabled = loading;
  if (text) text.classList.toggle('hidden', loading);
  if (spinner) spinner.classList.toggle('hidden', !loading);
}

// Toggle password visibility
['toggle-password', 'toggle-confirm'].forEach(id => {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.addEventListener('click', () => {
    const inputId = id === 'toggle-password' ? 'password' : 'confirm-password';
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    btn.textContent = isPass ? '🙈' : '👁';
    btn.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
  });
});

// ── PASSWORD STRENGTH ─────────────────────────────────────────
const pwInput = document.getElementById('password');
const strengthFill = document.getElementById('strength-fill');
const strengthLabel = document.getElementById('strength-label');

if (pwInput && strengthFill) {
  pwInput.addEventListener('input', () => {
    const val = pwInput.value;
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const colors = ['', '#ef4444', '#f59e0b', '#3b82f6', '#10b981'];
    const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
    const widths = ['0%', '25%', '50%', '75%', '100%'];

    strengthFill.style.width = val ? widths[score] : '0%';
    strengthFill.style.background = colors[score] || '';
    if (strengthLabel) strengthLabel.textContent = val ? `Password strength: ${labels[score]}` : 'Enter a password';
  });
}

// ── SIGNUP FORM ───────────────────────────────────────────────
const NAME_REGEX = /^[\p{L}\s'-]+$/u;

const signupForm = document.getElementById('signup-form');
if (signupForm) {
  // Real-time validation
  signupForm.querySelectorAll('input').forEach(input => {
    input.addEventListener('blur', () => validateSignupField(input));
    input.addEventListener('input', () => clearError(input.id));
  });

  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const name = document.getElementById('name')?.value.trim();
    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;
    const confirm = document.getElementById('confirm-password')?.value;

    let valid = true;

    if (!name || name.length < 2) {
      showError('name', 'Name must be at least 2 characters'); valid = false;
    } else if (!NAME_REGEX.test(name)) {
      showError('name', 'Name must contain only letters, spaces, hyphens, or apostrophes'); valid = false;
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('email', 'Please enter a valid email address'); valid = false;
    }

    if (!password || password.length < 8) {
      showError('password', 'Password must be at least 8 characters'); valid = false;
    }

    if (password !== confirm) {
      showError('confirm-password', 'Passwords do not match'); valid = false;
    }

    if (!valid) return;

    setLoading(true);
    try {
      const data = await api.signup({ name, email, password, confirm_password: confirm });
      setToken(data.access_token);
      setUser(data.user);
      toast.success('Account created! 🎉', 'Welcome to StudyAI!');

      // Redirect to onboarding for new users
      setTimeout(() => {
        navigateTo(data.user.onboarding_complete
          ? '/dashboard/index.html'
          : '/onboarding/index.html');
      }, 1000);
    } catch (err) {
      showGlobalError(err.message || 'Signup failed. Please try again.');
      toast.error('Signup failed', err.message);
    } finally {
      setLoading(false);
    }
  });
}

function validateSignupField(input) {
  const { id, value } = input;
  if (id === 'name') {
    if (!value.trim()) showError(id, 'Name is required');
    else if (value.trim().length < 2) showError(id, 'Name must be at least 2 characters');
    else if (!NAME_REGEX.test(value.trim())) showError(id, 'Name must contain only letters, spaces, hyphens, or apostrophes');
  } else if (id === 'email') {
    if (!value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) showError(id, 'Valid email required');
  } else if (id === 'password') {
    if (value.length < 8) showError(id, 'Password must be at least 8 characters');
  } else if (id === 'confirm-password') {
    const pw = document.getElementById('password')?.value;
    if (value !== pw) showError(id, 'Passwords do not match');
  }
}

// ── LOGIN FORM ────────────────────────────────────────────────
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => clearError(input.id));
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAllErrors();

    const email = document.getElementById('email')?.value.trim();
    const password = document.getElementById('password')?.value;

    let valid = true;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showError('email', 'Please enter a valid email address'); valid = false;
    }
    if (!password) {
      showError('password', 'Password is required'); valid = false;
    }

    if (!valid) return;

    setLoading(true);
    try {
      const data = await api.login({ email, password });
      setToken(data.access_token);
      setUser(data.user);
      toast.success('Welcome back! 👋', `Good to see you, ${data.user.name}!`);

      setTimeout(() => {
        navigateTo(data.user.onboarding_complete
          ? '/dashboard/index.html'
          : '/onboarding/index.html');
      }, 800);
    } catch (err) {
      showGlobalError(err.message || 'Login failed. Please check your credentials.');
      toast.error('Login failed', err.message);
    } finally {
      setLoading(false);
    }
  });
}

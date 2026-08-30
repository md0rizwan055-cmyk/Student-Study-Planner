/**
 * API Client — Centralized fetch wrapper with auth, error handling, caching
 */

const API_BASE = 'http://localhost:8000/api';

// Simple in-memory cache
const _cache = new Map();
const CACHE_TTL = 30_000; // 30 seconds

export function getToken() {
  return localStorage.getItem('sp_token');
}

export function setToken(token) {
  localStorage.setItem('sp_token', token);
}

export function clearToken() {
  localStorage.removeItem('sp_token');
  localStorage.removeItem('sp_user');
}

export function getUser() {
  try {
    return JSON.parse(localStorage.getItem('sp_user') || 'null');
  } catch { return null; }
}

export function setUser(user) {
  localStorage.setItem('sp_user', JSON.stringify(user));
}

async function request(method, path, body = null, options = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const url = `${API_BASE}${path}`;
  const cacheKey = `${method}:${url}`;

  // Return cached GET responses
  if (method === 'GET' && !options.noCache) {
    const cached = _cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return cached.data;
    }
  }

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  let response;
  try {
    response = await fetch(url, config);
  } catch (err) {
    throw new ApiError('Unable to connect to backend server. Make sure the FastAPI server is running on http://localhost:8000', 0);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  // Handle 401 on protected routes (avoid redirecting if already on login/signup or performing auth actions)
  if (response.status === 401) {
    const isAuthEndpoint = path.startsWith('/auth/login') || path.startsWith('/auth/signup');
    const isAuthPage = window.location.pathname.includes('/auth/login') || window.location.pathname.includes('/auth/signup');

    if (!isAuthEndpoint && !isAuthPage) {
      clearToken();
      const isUnderFrontend = window.location.pathname.includes('/frontend/');
      window.location.href = isUnderFrontend ? '/frontend/auth/login.html' : '/auth/login.html';
      throw new ApiError('Session expired — please login again', 401, data);
    }
  }

  if (!response.ok) {
    let msg = 'Request failed';
    if (typeof data?.detail === 'string') {
      msg = data.detail;
    } else if (Array.isArray(data?.detail)) {
      msg = data.detail.map(d => (typeof d === 'string' ? d : d.msg || d.detail || JSON.stringify(d))).join(', ');
    } else if (data?.detail && typeof data.detail === 'object') {
      msg = data.detail.msg || data.detail.message || JSON.stringify(data.detail);
    } else if (data?.message) {
      msg = data.message;
    } else {
      msg = `Request failed (${response.status})`;
    }
    throw new ApiError(msg, response.status, data);
  }

  // Cache successful GET responses
  if (method === 'GET') {
    _cache.set(cacheKey, { data, ts: Date.now() });
  } else {
    // Invalidate related cache on mutations
    for (const key of _cache.keys()) {
      if (key.includes(path.split('?')[0].slice(0, 20))) {
        _cache.delete(key);
      }
    }
  }

  return data;
}

class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

export const api = {
  get: (path, opts) => request('GET', path, null, opts),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  delete: (path) => request('DELETE', path),

  // Auth
  signup: (data) => api.post('/auth/signup', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),

  // Student
  completeOnboarding: (data) => api.put('/student/onboarding', data),
  getProfile: () => api.get('/student/profile'),
  updateProfile: (data) => api.put('/student/profile', data),
  updatePreferences: (data) => api.put('/student/preferences', data),
  deleteAccount: () => api.delete('/student/account'),

  // Subjects
  getSubjects: () => api.get('/subjects', { noCache: true }),
  createSubject: (data) => api.post('/subjects', data),
  updateSubject: (id, data) => api.put(`/subjects/${id}`, data),
  deleteSubject: (id) => api.delete(`/subjects/${id}`),

  // Topics
  getTopics: (subjectId) => api.get(`/topics${subjectId ? `?subject_id=${subjectId}` : ''}`, { noCache: true }),
  createTopic: (data) => api.post('/topics', data),
  updateTopic: (id, data) => api.put(`/topics/${id}`, data),
  updateTopicProgress: (id, data) => api.put(`/topics/${id}/progress`, data),
  deleteTopic: (id) => api.delete(`/topics/${id}`),

  // Planner
  generatePlan: (regenerate = false) => api.post(`/planner/generate?regenerate=${regenerate}`),
  getTimetable: (date) => api.get(`/planner/timetable?date=${date}`, { noCache: true }),
  getWeekly: (weekStart) => api.get(`/planner/weekly?week_start=${weekStart}`, { noCache: true }),
  getExamPrep: () => api.get('/planner/exam-prep', { noCache: true }),
  getPlanStatus: () => api.get('/planner/status'),

  // Sessions
  getSessions: (date) => api.get(`/sessions${date ? `?date=${date}` : ''}`, { noCache: true }),
  completeSession: (id) => api.put(`/sessions/${id}/complete`),
  skipSession: (id) => api.put(`/sessions/${id}/skip`),
  rescheduleSession: (id, data) => api.put(`/sessions/${id}/reschedule`, data),
  submitFeedback: (id, data) => api.post(`/sessions/${id}/feedback`, data),
  redistributeMissed: () => api.post('/sessions/redistribute-missed'),

  // Progress
  getOverview: () => api.get('/progress/overview', { noCache: true }),
  getSubjectProgress: () => api.get('/progress/subjects', { noCache: true }),
  getWeeklyHours: (weeks) => api.get(`/progress/weekly-hours?weeks=${weeks || 8}`, { noCache: true }),
  getStreaks: () => api.get('/progress/streaks', { noCache: true }),
  getAnalytics: () => api.get('/progress/analytics', { noCache: true }),

  // AI
  chat: (message, conversationId) => api.post('/ai/chat', { message, conversation_id: conversationId || 'default' }),
  getRecommendations: () => api.get('/ai/recommendations', { noCache: true }),
  getTopicPriorities: () => api.get('/ai/topic-priorities'),

  // Notifications
  getNotifications: () => api.get('/notifications', { noCache: true }),
  markNotifRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/mark-all-read'),
  deleteNotification: (id) => api.delete(`/notifications/${id}`),
  updateNotifPreferences: (data) => api.put('/notifications/preferences', data),
};

export default api;

// Auth service — no imports from api.js to avoid circular deps

const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL;

const formatValidationPath = (loc = []) => {
  const field = loc[loc.length - 1];

  if (!field || field === '__root__') {
    return '';
  }

  return `${field.charAt(0).toUpperCase()}${field.slice(1)}: `;
};

const toSentenceCase = (value) => {
  if (!value) {
    return '';
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
};

const normalizeGenericMessage = (message = '') => {
  return message.replace(/^Value error,\s*/i, '').trim();
};

const formatValidationMessage = (item) => {
  if (!item) {
    return null;
  }

  if (typeof item === 'string') {
    return item;
  }

  const field = item.loc?.[item.loc.length - 1];
  const rawMessage = typeof item.msg === 'string' ? item.msg : '';
  const normalizedMessage = normalizeGenericMessage(rawMessage);

  if (field === 'email') {
    return 'Please enter a valid email address.';
  }

  if (field === 'password') {
    return 'Password must be at least 6 characters and include uppercase, lowercase, a number, and a special character.';
  }

  if (field === 'name' && normalizedMessage) {
    return `Name: ${toSentenceCase(normalizedMessage)}`;
  }

  if (normalizedMessage) {
    return `${formatValidationPath(item.loc)}${toSentenceCase(normalizedMessage)}`;
  }

  return null;
};

const createAuthError = (detail, fallbackMessage) => {
  const messages = [];

  if (Array.isArray(detail)) {
    messages.push(...detail.map(formatValidationMessage).filter(Boolean));
  }

  if (messages.length === 0 && typeof detail === 'string' && detail.trim()) {
    messages.push(detail.trim());
  }

  if (messages.length === 0 && detail && typeof detail === 'object' && typeof detail.msg === 'string') {
    messages.push(detail.msg);
  }

  if (messages.length === 0) {
    messages.push(fallbackMessage);
  }

  const error = new Error(messages[0]);
  error.messages = messages;
  return error;
};

export const authService = {
  getToken: () => {
    return localStorage.getItem('ai_tutor_access_token');
  },
  
  setToken: (token) => {
    localStorage.setItem('ai_tutor_access_token', token);
  },

  setRefreshToken: (token) => {
    localStorage.setItem('ai_tutor_refresh_token', token);
  },

  getRefreshToken: () => {
    return localStorage.getItem('ai_tutor_refresh_token');
  },
  
  clearSession: () => {
    localStorage.removeItem('ai_tutor_access_token');
    localStorage.removeItem('ai_tutor_refresh_token');
    localStorage.removeItem('ai_tutor_user_id');
    localStorage.removeItem('ai_tutor_name');
  },

  getCurrentUserId: () => {
    return localStorage.getItem('ai_tutor_user_id');
  },

  getCurrentUserName: () => {
    return localStorage.getItem('ai_tutor_name') || 'User';
  },

  // Uses fetch directly to avoid circular dependency with api.js
  login: async (email, password) => {
    const response = await fetch(`${AUTH_BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createAuthError(err.detail, 'Login failed');
    }

    const data = await response.json();

    if (!data.access_token) {
      throw createAuthError(null, 'Invalid login response from server');
    }
    authService.setToken(data.access_token);
    if (data.refresh_token) {
      authService.setRefreshToken(data.refresh_token);
    }
    if (data.user_id) localStorage.setItem('ai_tutor_user_id', data.user_id);
    if (data.name) localStorage.setItem('ai_tutor_name', data.name);

    return data;
  },

  register: async (name, email, password) => {
    const response = await fetch(`${AUTH_BASE_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw createAuthError(err.detail, 'Registration failed');
    }

    return await response.json();
  },

  getMe: async () => {
    const token = authService.getToken();
    const response = await fetch(`${AUTH_BASE_URL}/me`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error('Failed to get user profile');
    }

    return await response.json();
  },

  refreshAuthToken: async () => {
    const refreshToken = authService.getRefreshToken();
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }

    const response = await fetch(`${AUTH_BASE_URL}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      authService.clearSession();
      throw createAuthError(err.detail, 'Token refresh failed');
    }

    const data = await response.json();
    authService.setToken(data.access_token);
    if (data.refresh_token) {
      authService.setRefreshToken(data.refresh_token);
    }
    return data.access_token;
  }
};

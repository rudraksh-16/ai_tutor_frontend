// Auth service — no imports from api.js to avoid circular deps

const AUTH_BASE_URL = 'http://localhost:8000/api/auth';

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
      throw new Error(err.detail || 'Login failed');
    }

    const data = await response.json();
    
    authService.setToken(data.access_token);
    if (data.refresh_token) {
      authService.setRefreshToken(data.refresh_token);
    }
    localStorage.setItem('ai_tutor_user_id', data.user_id);
    localStorage.setItem('ai_tutor_name', data.name);
    
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
      throw new Error(err.detail || 'Registration failed');
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
      throw new Error(err.detail || 'Token refresh failed');
    }

    const data = await response.json();
    authService.setToken(data.access_token);
    if (data.refresh_token) {
      authService.setRefreshToken(data.refresh_token);
    }
    return data.access_token;
  }
};

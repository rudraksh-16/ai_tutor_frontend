import axios from 'axios';
import { authService } from './auth';

const API_BASE_URL = 'http://localhost:8000/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use((config) => {
  const token = authService.getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Auto-refresh token on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers['Authorization'] = 'Bearer ' + token;
          return apiClient(originalRequest);
        }).catch(err => {
          return Promise.reject(err);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const newAccessToken = await authService.refreshAuthToken();
        processQueue(null, newAccessToken);
        originalRequest.headers['Authorization'] = 'Bearer ' + newAccessToken;
        return apiClient(originalRequest);
      } catch (err) {
        processQueue(err, null);
        authService.clearSession();
        if (window.location.pathname !== '/auth') {
          window.location.href = '/auth';
        }
        return Promise.reject(err);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  // ─── Sidebar ────────────────────────────────────────────
  getSidebar: async () => {
    const response = await apiClient.get('/sidebar/');
    return response.data;
  },

  // ─── Topics ─────────────────────────────────────────────
  startTopic: async (title, userSummary) => {
    const response = await apiClient.post('/topics/start', {
      title,
      user_summary: userSummary,
    });
    return response.data;
  },

  getTopic: async (topicId) => {
    const response = await apiClient.get(`/topics/${topicId}`);
    return response.data;
  },

  getTopicChapters: async (topicId) => {
    const response = await apiClient.get(`/topics/${topicId}/chapters`);
    return response.data;
  },

  // Returns { topic_status, total_chapters, planned_chapters, planning_complete }
  getPlanningStatus: async (topicId) => {
    const response = await apiClient.get(`/topics/${topicId}/status`);
    return response.data;
  },

  // ─── Chapters ───────────────────────────────────────────
  getChapter: async (chapterId) => {
    const response = await apiClient.get(`/chapters/${chapterId}`);
    return response.data;
  },

  completeChapter: async (chapterId) => {
    const response = await apiClient.post(`/chapters/${chapterId}/complete`);
    return response.data;
  },

  // ─── Planner (manual fallback) ──────────────────────────
  triggerPlanner: async (topicId, data) => {
    const response = await apiClient.post(`/chat/curriculum/${topicId}/plan`, data);
    return response.data;
  },

  // ─── Conversation History ──────────────────────────────
  getCurriculumMessages: async (topicId) => {
    const response = await apiClient.get(`/conversations/topic/${topicId}/messages`);
    return response.data;
  },

  getChapterMessages: async (chapterId, type) => {
    const response = await apiClient.get(`/conversations/chapter/${chapterId}/messages`, {
      params: { type }
    });
    return response.data;
  },

  // ─── JIT Document (Sections) ─────────────────────────────
  getChapterDocument: async (chapter_id) => {
    const response = await apiClient.get(`/chapters/${chapter_id}/document`);
    return response.data;
  },

  retryChapterGeneration: async (chapter_id) => {
    const response = await apiClient.post(`/chapters/${chapter_id}/retry`);
    return response.data;
  },

  triggerChapterGeneration: async (chapter_id) => {
    const response = await apiClient.post(`/chapters/${chapter_id}/generate`);
    return response.data;
  },

  // ─── Section Read Progress ──────────────────────────────
  markSectionRead: async (sectionId) => {
    const response = await apiClient.patch(`/sections/${sectionId}/read`);
    return response.data;
  },

  // ─── Quiz (Secure Backend) ──────────────────────────────
  getQuizQuestions: async (chapterId) => {
    const response = await apiClient.get(`/quiz/${chapterId}`);
    return response.data;
  },

  submitQuiz: async (chapterId, answers) => {
    const response = await apiClient.post(`/quiz/${chapterId}/submit`, { answers });
    return response.data;
  },

  // ─── Section Quizzes ────────────────────────────────────
  getSectionQuiz: async (sectionId) => {
    const response = await apiClient.get(`/quiz/section/${sectionId}`);
    return response.data;
  },

  generateSectionQuiz: async (sectionId) => {
    const response = await apiClient.post(`/quiz/section/${sectionId}/generate`);
    return response.data;
  },

  submitSectionQuiz: async (sectionId, answers) => {
    const response = await apiClient.post(`/quiz/section/${sectionId}/submit`, { answers });
    return response.data;
  },
};

// ─── SSE Streaming ──────────────────────────────────────────
/**
 * Generic SSE handler for streaming chat.
 * @param {string} endpoint
 * @param {object} request
 * @param {function} onMessageUpdate - called with each text chunk
 * @param {function} onDone - called when stream finishes
 * @param {function} onError - called on error
 * @param {object} [eventHandlers] - optional map of SSE event type handlers
 *   e.g. { planning_started: fn, quiz_ready: fn, quiz_passed: fn, chapter_completed: fn }
 */
const streamGenericChat = async (
  endpoint,
  request,
  onMessageUpdate,
  onDone,
  onError,
  eventHandlers = {}
) => {
  try {
    const headers = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };

    const token = authService.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    let response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (response.status === 401) {
      try {
        const newAccessToken = await authService.refreshAuthToken();
        headers['Authorization'] = `Bearer ${newAccessToken}`;
        response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(request),
        });
      } catch (err) {
        authService.clearSession();
        if (window.location.pathname !== '/auth') {
          window.location.href = '/auth';
        }
        throw new Error('Session expired. Please log in again.');
      }
    }

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');

    if (!reader) {
      throw new Error('No readable stream available');
    }

    let done = false;

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;

      if (value) {
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (dataStr) {
              try {
                const parsed = JSON.parse(dataStr);

                // Handle known SSE event types
                if (parsed.type && eventHandlers[parsed.type]) {
                  eventHandlers[parsed.type](parsed);
                  continue;
                }

                if (parsed.error) {
                  onError(parsed.error);
                } else if (parsed.content) {
                  onMessageUpdate(parsed.content);
                }
              } catch (e) {
                console.error("Failed to parse chunk", e, dataStr);
              }
            }
          }
        }
      }
    }
    
    onDone();
  } catch (err) {
    onError(err.message || 'Unknown stream error');
  }
};

export const streamCurriculumChat = (
  request,
  onMessageUpdate,
  onDone,
  onError,
  onPlanningStarted
) => streamGenericChat(
  '/chat/curriculum',
  request,
  onMessageUpdate,
  onDone,
  onError,
  { planning_started: onPlanningStarted }
);

export const streamTeacherChat = (
  request,
  onMessageUpdate,
  onDone,
  onError,
  onQuizReady
) => streamGenericChat(
  '/chat/teacher',
  request,
  onMessageUpdate,
  onDone,
  onError,
  { quiz_ready: onQuizReady }
);

export const streamQuizChat = (
  request,
  onMessageUpdate,
  onDone,
  onError,
  onQuizPassed
) => streamGenericChat(
  '/chat/quiz',
  request,
  onMessageUpdate,
  onDone,
  onError,
  { quiz_passed: onQuizPassed }
);

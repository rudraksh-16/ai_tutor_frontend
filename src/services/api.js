import axios from 'axios';
import { authService } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const inFlightGetRequests = new Map();

const getWebSocketBaseUrl = () => {
  const apiUrl = new URL(API_BASE_URL);
  apiUrl.protocol = apiUrl.protocol === 'https:' ? 'wss:' : 'ws:';
  return apiUrl;
};

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

const getWithInFlightDedupe = (key, request) => {
  const scopedKey = `${authService.getCurrentUserId() || 'anon'}:${key}`;

  if (inFlightGetRequests.has(scopedKey)) {
    return inFlightGetRequests.get(scopedKey);
  }

  const promise = request()
    .then((response) => response.data)
    .finally(() => {
      inFlightGetRequests.delete(scopedKey);
    });

  inFlightGetRequests.set(scopedKey, promise);
  return promise;
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
      } catch (refreshError) {
        processQueue(refreshError, null);
        authService.clearSession();
        if (window.location.pathname !== '/auth') {
          window.location.href = '/auth';
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export const apiService = {
  // ─── Sidebar ────────────────────────────────────────────
  getSidebar: async (signal) => {
    if (signal) {
      const response = await apiClient.get('/sidebar/', { signal });
      return response.data;
    }
    return getWithInFlightDedupe('GET /sidebar/', () => apiClient.get('/sidebar/'));
  },

  // ─── Topics ─────────────────────────────────────────────
  startTopic: async (title, userSummary) => {
    const response = await apiClient.post('/topics/start', {
      title,
      user_summary: userSummary,
    });
    return response.data;
  },

  getTopic: async (topicId, signal) => {
    const response = await apiClient.get(`/topics/${topicId}`, { signal });
    return response.data;
  },

  getTopicChapters: async (topicId, signal) => {
    const response = await apiClient.get(`/topics/${topicId}/chapters`, { signal });
    return response.data;
  },

  // Returns { topic_status, total_chapters, planned_chapters, planning_complete }
  getPlanningStatus: async (topicId, signal) => {
    if (signal) {
      const response = await apiClient.get(`/topics/${topicId}/status`, { signal });
      return response.data;
    }
    return getWithInFlightDedupe(
      `GET /topics/${topicId}/status`,
      () => apiClient.get(`/topics/${topicId}/status`)
    );
  },

  // ─── Chapters ───────────────────────────────────────────
  getChapter: async (chapterId, signal) => {
    const response = await apiClient.get(`/chapters/${chapterId}`, { signal });
    return response.data;
  },

  completeChapter: async (chapterId) => {
    const response = await apiClient.post(`/chapters/${chapterId}/complete`);
    return response.data;
  },

  getChapterQuizState: async (chapterId, quizKey) => {
    const response = await apiClient.get(`/chapters/${chapterId}/quiz-state`, {
      params: { quiz_key: quizKey },
    });
    return response.data;
  },

  saveChapterQuizState: async (chapterId, payload) => {
    const response = await apiClient.put(`/chapters/${chapterId}/quiz-state`, payload);
    return response.data;
  },

  // ─── Planner (manual fallback) ──────────────────────────
  triggerPlanner: async (topicId, data) => {
    const response = await apiClient.post(`/chat/curriculum/${topicId}/plan`, data);
    return response.data;
  },

  // ─── Conversation History ──────────────────────────────
  getCurriculumMessages: async (topicId, signal) => {
    const response = await apiClient.get(`/conversations/topic/${topicId}/messages`, { signal });
    return response.data;
  },

  getChapterMessages: async (chapterId, type, signal) => {
    const response = await apiClient.get(`/conversations/chapter/${chapterId}/messages`, {
      params: { type },
      signal,
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
  getSectionQuiz: async (sectionId, signal) => {
    const response = await apiClient.get(`/quiz/section/${sectionId}`, { signal });
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
  let reader;
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
      const httpErr = new Error(`HTTP error! status: ${response.status}`);
      httpErr.httpStatus = response.status;
      throw httpErr;
    }

    reader = response.body?.getReader();
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
                  reader.cancel();
                  onError("We're having trouble on our end. Please try again in a moment.");
                  return;
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
    reader?.cancel();
    const isNetworkError = !navigator.onLine ||
      (err instanceof TypeError && (
        err.message.includes('Failed to fetch') ||
        err.message.includes('NetworkError') ||
        err.message.includes('Load failed')
      ));
    const isServerError = err.httpStatus >= 500;
    onError(
      isNetworkError ? 'No internet connection. Please check your connection and try again.'
      : isServerError ? "We're having trouble on our end. Please try again in a moment."
      : (err.message || 'Unknown stream error')
    );
  }
};

export const streamCurriculumChat = (
  request,
  onMessageUpdate,
  onDone,
  onError,
  onPlanningStarted,
  onResumeSnapshot
) => streamGenericChat(
  '/chat/curriculum',
  request,
  onMessageUpdate,
  onDone,
  onError,
  {
    planning_started: onPlanningStarted,
    resume_snapshot: onResumeSnapshot,
  }
);

export const streamTeacherChat = (
  request,
  onMessageUpdate,
  onDone,
  onError,
  onQuizReady,
  onResumeSnapshot
) => streamGenericChat(
  '/chat/teacher',
  request,
  onMessageUpdate,
  onDone,
  onError,
  {
    quiz_ready: onQuizReady,
    resume_snapshot: onResumeSnapshot,
  }
);

export const streamQuizChat = (
  request,
  onMessageUpdate,
  onDone,
  onError,
  onQuizPassed,
  onResumeSnapshot
) => streamGenericChat(
  '/chat/quiz',
  request,
  onMessageUpdate,
  onDone,
  onError,
  {
    quiz_passed: onQuizPassed,
    resume_snapshot: onResumeSnapshot,
  }
);

export const openPlanningStatusSocket = (topicId, { onStatus, onOpen, onError, onClose } = {}) => {
  try {
    const wsUrl = getWebSocketBaseUrl();
    wsUrl.pathname = `${wsUrl.pathname.replace(/\/$/, '')}/topics/${topicId}/status/ws`;
    const token = authService.getToken();
    if (token) {
      wsUrl.searchParams.set('token', token);
    }

    const socket = new WebSocket(wsUrl.toString());

    socket.onopen = () => {
      onOpen?.();
    };

    socket.onmessage = (event) => {
      try {
        const parsed = JSON.parse(event.data);
        onStatus?.(parsed);
      } catch (error) {
        console.error('Failed to parse planner WebSocket payload:', error);
      }
    };

    socket.onerror = (event) => {
      onError?.(event);
    };

    socket.onclose = (event) => {
      onClose?.(event);
    };

    return socket;
  } catch (error) {
    onError?.(error);
    return null;
  }
};

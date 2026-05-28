# Bug Fixes Documentation

## Overview

This document covers all bugs found and fixed in the AI Tutor frontend codebase, organized by severity. Each entry describes the bug, what it was causing at runtime, and exactly how it was fixed.

---

## 1. CRITICAL — Hardcoded Auth Base URL

**File:** `src/services/auth.js:3`

### The Bug
```js
// Before
const AUTH_BASE_URL = 'http://localhost:8000/api/auth';
```

### What It Was Causing
- All authentication requests (login, register, token refresh) were hardcoded to `localhost:8000`
- Deploying to any staging or production environment would silently break the entire auth system
- No way to configure the auth endpoint without modifying source code
- The same bug had already been fixed in `api.js` for the API base URL, but `auth.js` was missed

### The Fix
```js
// After
const AUTH_BASE_URL = import.meta.env.VITE_AUTH_BASE_URL;
```
Added `VITE_AUTH_BASE_URL=http://localhost:8000/api/auth` to `.env` and `.env.example`. The `.env` file is gitignored so each environment can configure its own value.

---

## 2. HIGH — Login Response Written to localStorage Without Validation

**File:** `src/services/auth.js:130-135`

### The Bug
```js
// Before
const data = await response.json();
authService.setToken(data.access_token);
localStorage.setItem('ai_tutor_user_id', data.user_id);
localStorage.setItem('ai_tutor_name', data.name);
```

### What It Was Causing
- If the backend returned a malformed response (missing fields, schema change, or partial failure), `undefined` values would be written to `localStorage`
- `authService.getToken()` would return the string `"undefined"` and be treated as a valid token
- Subsequent API calls would send `Authorization: Bearer undefined`, getting rejected with 401 errors
- The user would appear logged in but every request would fail silently
- `getCurrentUserName()` would return `"undefined"` instead of a real name, showing broken UI

### The Fix
```js
// After
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
```
Added a hard check for `access_token` — throws immediately if missing. The `user_id` and `name` fields are only written if present, preventing `"undefined"` strings from polluting localStorage.

---

## 3. HIGH — SSE Stream Reader Not Cancelled on Error

**File:** `src/services/api.js:283-330`

### The Bug
```js
// Before
const streamGenericChat = async (...) => {
  try {
    const reader = response.body?.getReader(); // inside try block
    // ...
    while (!done) { /* read chunks */ }
    onDone();
  } catch (err) {
    onError(err.message || 'Unknown stream error');
    // reader never cancelled here
  }
};
```

### What It Was Causing
- When any error occurred during streaming (network error, JSON parse failure, server error), the `catch` block called `onError` but never called `reader.cancel()`
- The underlying `ReadableStream` reader remained open and locked
- The browser held onto the connection, consuming memory and a network slot
- Over multiple error events (e.g., repeated failed quiz streams), this accumulated into a resource leak
- On some browsers, subsequent requests to the same endpoint could be blocked or delayed

### The Fix
```js
// After — reader hoisted to be accessible in catch
let reader;
try {
  // ...
  reader = response.body?.getReader();
  // ...
} catch (err) {
  reader?.cancel(); // always cancel the reader on any error
  onError(err.message || 'Unknown stream error');
}
```
The `reader` variable is hoisted outside the `try` block so the `catch` block can access it. `reader?.cancel()` is called before `onError`, ensuring the stream is always cleaned up.

---

## 4. HIGH — SSE Error Event Does Not Stop the Stream Loop

**File:** `src/services/api.js:313-314`

### The Bug
```js
// Before
if (parsed.error) {
  onError(parsed.error);
  // loop continues reading more chunks after this!
} else if (parsed.content) {
  onMessageUpdate(parsed.content);
}
```

### What It Was Causing
- When the server sent an SSE event with an `error` field, `onError` was called correctly
- However, the `while (!done)` loop continued reading more chunks from the stream
- Any subsequent data chunks (possibly garbage or retry frames after a server-side error) would still be processed
- `onMessageUpdate` could be called after `onError`, appending content to a message that was supposed to show an error state
- The reader was never explicitly closed, compounding the leak from Bug #3
- The UI would show both an error and partial streamed content simultaneously

### The Fix
```js
// After
if (parsed.error) {
  reader.cancel();   // close the stream
  onError(parsed.error);
  return;            // exit the entire function — no more chunk processing
} else if (parsed.content) {
  onMessageUpdate(parsed.content);
}
```
After calling `onError`, the reader is cancelled and the function returns immediately. No further chunks are processed, and `onDone` is never called after an error.

---

## 5. HIGH — Polling Interval Leaks on Component Unmount

**File:** `src/components/Learning/CourseOverview.jsx:98-127`

### The Bug
```js
// Before
const pollChapterStatus = (chapterId) => {
  let count = 0;
  const interval = setInterval(async () => {
    // ... calls setGeneratingIds (setState) every 3 seconds
  }, 3000);
  // interval reference never stored, never cleaned up
};
```

### What It Was Causing
- When `handleGenerate` was called and the component subsequently unmounted (e.g., user navigated away), the `setInterval` kept firing every 3 seconds
- Each tick called `setGeneratingIds(...)` — a React state setter on an unmounted component
- React logs the warning: *"Can't perform a React state update on an unmounted component"*
- More critically: each tick also called `apiService.getChapter(chapterId)` — API calls continued firing even after the user had left the page
- If the user navigated back, a new interval would start while the old one was still running — causing double API calls and race conditions on state

### The Fix
```js
// After
const pollIntervalsRef = useRef(new Set());

useEffect(() => {
  return () => {
    pollIntervalsRef.current.forEach(clearInterval); // clear all on unmount
  };
}, []);

const pollChapterStatus = (chapterId) => {
  let count = 0;
  const interval = setInterval(async () => {
    count++;
    if (count > 40) {
      clearInterval(interval);
      pollIntervalsRef.current.delete(interval);
      // ...
    }
    // ...
    if (state === 'in_progress' || state === 'completed') {
      clearInterval(interval);
      pollIntervalsRef.current.delete(interval);
      // ...
    }
  }, 3000);
  pollIntervalsRef.current.add(interval); // track every interval
};
```
A `useRef` Set tracks all active intervals. Each interval is added when created and removed when it naturally ends. The `useEffect` cleanup clears every remaining interval on unmount.

---

## 6. MEDIUM — resumeConversation Fires Twice Due to Dependency Array

**File:** `src/components/Chat/ChatWindow.jsx:307-310`

### The Bug
```js
// Before
useEffect(() => {
  const loadHistory = async () => {
    // ...
    if (lastMessage?.role === 'user') {
      resumeConversation(); // called inside effect
    }
  };
  loadHistory();
}, [chapterId, resumeConversation, scrollToLatestMessage, startConversation]);
//             ^ resumeConversation in deps — effect re-runs when it changes reference
```

### What It Was Causing
- `resumeConversation` is defined with `useCallback` and has its own dependency array. Any time one of *its* dependencies changed (e.g., `onChapterCompleted` prop reference changed on parent re-render), `resumeConversation` got a new reference
- This caused the `loadHistory` effect to re-run, which re-fetched chat history from the API and called `resumeConversation()` again
- Result: duplicate `streamTeacherChat` SSE connections opened simultaneously
- The user would see duplicate AI responses appended to the chat, or two competing streams overwriting each other
- This was also the primary cause of double network calls visible in the browser dev tools

### The Fix
```js
// After — ref pattern to decouple from deps
const resumeConversationRef = useRef(null);

useEffect(() => {
  resumeConversationRef.current = resumeConversation;
}, [resumeConversation]);

useEffect(() => {
  const loadHistory = async () => {
    // ...
    if (lastMessage?.role === 'user') {
      resumeConversationRef.current(); // use ref — not a dependency
    }
  };
  // ...
}, [chapterId, scrollToLatestMessage, startConversation]);
// resumeConversation removed from deps
```
The ref is always kept up to date with the latest `resumeConversation` via a dedicated sync effect. The `loadHistory` effect calls `resumeConversationRef.current()` instead of `resumeConversation` directly, so it no longer triggers re-runs when `resumeConversation` changes reference.

---

## 7. MEDIUM — Auto-Advance Overwrites Manual Section Navigation

**File:** `src/components/Learning/ReadingMode.jsx:104-106`

### The Bug
```js
// Before
const [viewIndex, setViewIndex] = useState(0);

useEffect(() => {
  setViewIndex(activeSectionIndex); // fires every time activeSectionIndex changes
}, [activeSectionIndex]);
```

### What It Was Causing
- `activeSectionIndex` is derived from `sections` state — it points to the first incomplete section
- Every time sections changed (e.g., when data refreshed or polling resolved), this effect would fire and reset `viewIndex` to `activeSectionIndex`
- If a user had manually navigated backward to review an earlier section (`handlePrev`), any sections data update would snap them back to the active section
- This made reviewing completed material unreliable — the user's scroll position was constantly being hijacked
- In React 18 StrictMode, this effect also fired twice on mount, causing a brief flash as `viewIndex` was set, reset, and set again

### The Fix
```js
// After
const hasMountedRef = useRef(false);

useEffect(() => {
  if (!hasMountedRef.current) {
    // First mount: jump to the correct starting section
    hasMountedRef.current = true;
    setViewIndex(activeSectionIndex);
    return;
  }
  // After mount: only advance if user is on the section that just completed
  setViewIndex(prev => (prev === activeSectionIndex - 1 ? activeSectionIndex : prev));
}, [activeSectionIndex]);
```
On first mount, `viewIndex` is set to the correct starting position. On subsequent changes (user passes a quiz, `activeSectionIndex` increments by 1), auto-advance only happens if the user is currently viewing the section that just got completed. If they're reviewing an earlier section, their position is preserved.

---

## 8. MEDIUM — InlineQuiz useEffect Has No Abort Cleanup

**File:** `src/components/Learning/InlineQuiz.jsx:14-16`

### The Bug
```js
// Before
useEffect(() => {
  loadQuiz(); // no cleanup, no abort
}, [sectionId]);

const loadQuiz = async () => {
  setLoading(true);
  try {
    const data = await apiService.getSectionQuiz(sectionId);
    setQuestions(data);
  } catch (err) {
    if (err.response?.status === 404) {
      setQuestions([]);
    } else {
      setError('Could not load quiz questions.');
    }
  } finally {
    setLoading(false);
  }
};
```

### What It Was Causing
- In React 18 StrictMode, this effect fired twice — causing two simultaneous `GET /quiz/section/:id` requests
- Both requests would set state on the component, causing a double render with potentially inconsistent state
- If the component unmounted while a request was in flight, `setQuestions` and `setLoading` would be called on an unmounted component
- The `err.response?.status === 404` check assumed Axios error structure. A plain network error (e.g., connection refused) would have no `response` property, and `err.response?.status` would be `undefined` (falsy) — falling into the `else` branch and showing a generic error when the real cause was a network issue

### The Fix
```js
// After
useEffect(() => {
  const controller = new AbortController();
  loadQuiz(controller.signal);
  return () => controller.abort();
}, [sectionId]);

const loadQuiz = async (signal) => {
  setLoading(true);
  setError(null);
  try {
    const data = await apiService.getSectionQuiz(sectionId, signal);
    setQuestions(data);
  } catch (err) {
    if (err.code === 'ERR_CANCELED') return; // aborted — ignore
    if (err.response?.status === 404) {
      setQuestions([]);
    } else {
      setError('Could not load quiz questions.');
    }
  } finally {
    if (!signal?.aborted) setLoading(false); // skip if aborted
  }
};
```
`AbortController` cancels the in-flight request when the component unmounts or `sectionId` changes. Axios throws `ERR_CANCELED` for aborted requests — this is caught and silently ignored. The `finally` block checks `signal.aborted` before updating state.

---

## 9. MEDIUM — Redundant useEffect Re-Setting Auth State on Mount

**File:** `src/App.jsx:67-73`

### The Bug
```js
// Before
const [isAuthenticated, setIsAuthenticated] = useState(!!authService.getToken());

useEffect(() => {
  const token = authService.getToken();
  const currentUserId = authService.getCurrentUserId();
  if (token && currentUserId) {
    setIsAuthenticated(true); // redundant — already true from useState initializer
  }
}, []);
```

### What It Was Causing
- `isAuthenticated` is initialized as `!!authService.getToken()` — if a token exists, it starts as `true`
- The `useEffect` runs on mount, reads the same token, and calls `setIsAuthenticated(true)` again
- This triggered an extra re-render on every app mount with no effect
- In StrictMode, the effect fired twice, causing two extra re-renders
- Any components subscribed to auth state (Sidebar, ProtectedRoute) re-evaluated unnecessarily

### The Fix
The entire `useEffect` was deleted. The `useState` initializer already correctly reads the token at mount time. No side effect needed.

---

## 10. ROOT CAUSE — Double API Calls from React StrictMode

**Files:** All components with `useEffect` data fetching

### The Bug
```jsx
// src/main.jsx
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>  {/* This causes every effect to run twice in development */}
    <App />
  </React.StrictMode>
);
```

### What It Was Causing
React 18 StrictMode intentionally mounts every component twice in development (mount → unmount → remount) to help detect side effects that are not properly cleaned up. Without cleanup, every `useEffect` that fetches data would:

1. Fire on first mount → start API request A
2. Cleanup runs (no-op if no return function) → request A still in flight
3. Fire on second mount → start API request B
4. Both A and B complete → state is set twice, two requests hit the backend

This was visible in the browser Network tab as every page load generating duplicate requests for sidebar data, topic status, chapter messages, and quiz questions. While harmless in terms of correctness (the second response wins), it doubled the load on the backend server on every navigation event.

### The Fix — AbortController Pattern

Rather than removing `StrictMode` (which provides valuable warnings), every data-fetching `useEffect` was updated with `AbortController`:

```js
// Pattern applied to all affected components
useEffect(() => {
  const controller = new AbortController();

  const fetchData = async () => {
    try {
      const data = await apiService.someMethod(id, controller.signal);
      // update state...
    } catch (err) {
      if (err.code === 'ERR_CANCELED') return; // aborted — ignore
      // handle real errors...
    }
  };

  fetchData();
  return () => controller.abort(); // cleanup: abort in-flight request
}, [deps]);
```

**How it works with StrictMode:**
1. First mount → `controller1` created → request starts with `signal1`
2. Cleanup runs → `controller1.abort()` → Axios cancels request A, throws `ERR_CANCELED`
3. Second mount → `controller2` created → fresh request starts with `signal2`
4. Only one request completes and updates state

**Components updated:**

| Component | Effect | Methods with signal added |
|-----------|--------|--------------------------|
| `App.jsx` (CurriculumChatWrapper) | `checkRedirect` | `getPlanningStatus` |
| `Sidebar.jsx` | `fetchSidebar` | `getSidebar`, `getPlanningStatus` |
| `TopicLearnLayout.jsx` | `loadLearningData` | `getTopic`, `getTopicChapters` |
| `ChatWindow.jsx` | `loadChapter` | `getChapter` |
| `ChatWindow.jsx` | `loadHistory` | `getChapterMessages` |
| `InlineQuiz.jsx` | `loadQuiz` | `getSectionQuiz` |
| `CurriculumChat.jsx` | `initialize` | `getTopic`, `getPlanningStatus`, `getCurriculumMessages` |

**`apiService` methods updated to accept optional `signal`:**
- `getSidebar(signal?)`
- `getTopic(topicId, signal?)`
- `getTopicChapters(topicId, signal?)`
- `getPlanningStatus(topicId, signal?)`
- `getChapter(chapterId, signal?)`
- `getChapterMessages(chapterId, type, signal?)`
- `getCurriculumMessages(topicId, signal?)`
- `getSectionQuiz(sectionId, signal?)`

The `signal` parameter is optional — all existing callers that don't pass a signal (e.g., `handleQuizComplete`, `pollChapterStatus`) continue to work unchanged.

---

## Summary Table

| # | Severity | File | Bug | Impact |
|---|----------|------|-----|--------|
| 1 | CRITICAL | `auth.js` | Hardcoded auth URL | Breaks all auth in any non-localhost environment |
| 2 | HIGH | `auth.js` | No validation on login response | `"undefined"` written to localStorage, auth broken silently |
| 3 | HIGH | `api.js` | SSE reader not cancelled on error | Memory/connection leak on every stream error |
| 4 | HIGH | `api.js` | Stream loop continues after error event | Content appended after error state set, reader stays open |
| 5 | HIGH | `CourseOverview.jsx` | Polling interval not tracked | Intervals fire on unmounted component, API calls after navigation |
| 6 | MEDIUM | `ChatWindow.jsx` | `resumeConversation` in effect deps | Duplicate SSE streams opened, duplicate AI responses |
| 7 | MEDIUM | `ReadingMode.jsx` | Auto-advance overwrites manual nav | User's scroll position hijacked on any data refresh |
| 8 | MEDIUM | `InlineQuiz.jsx` | No abort cleanup on quiz load | Double API calls, state updates on unmounted component |
| 9 | MEDIUM | `App.jsx` | Redundant auth useEffect | Extra re-render on every app mount |
| 10 | ROOT CAUSE | All components | No AbortController in data effects | Double backend API calls on every page load (StrictMode) |

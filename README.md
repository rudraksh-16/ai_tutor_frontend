# AI Tutor — Frontend

React 19 + Vite SPA for the **AI Tutor** platform: a personalized, AI-driven learning experience where users negotiate a custom curriculum with an agent, then progress through chapters guided by a Teacher Agent, with auto-generated quizzes gating each chapter.

This repo is the **client only**. The backend lives at [`/Users/rudraksh/AI_Tutor`](../AI_Tutor) (FastAPI + LangGraph + PostgreSQL).

---

## Tech Stack

| Layer | Tool |
| --- | --- |
| Framework | React 19, React Router 7 |
| Build | Vite 8 |
| HTTP | Axios (with auto-refresh interceptor, in-flight GET dedupe) |
| Streaming | Server-Sent Events (SSE) via `fetch` + `ReadableStream` |
| Markdown | `react-markdown` + `remark-gfm` |
| Icons | `lucide-react` |
| Auth | JWT (access + refresh) stored in `localStorage`, scoped per user |
| Lint | ESLint 9 (flat config) |

---

## Prerequisites

- Node.js ≥ 20
- A running instance of the AI Tutor backend (see [Backend](#backend) below)

---

## Quick Start

```bash
# 1. Install deps
npm install

# 2. Configure environment
cp .env.example .env
# edit .env if your backend is not on localhost:8000

# 3. Start dev server
npm run dev
```

Vite serves on `http://localhost:5173` by default.

### Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the built `dist/` locally |
| `npm run lint` | Run ESLint over the repo |

---

## Environment Variables

Defined in `.env` (gitignored). Template in [.env.example](.env.example):

| Var | Default | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | Versioned REST + SSE endpoints |
| `VITE_AUTH_BASE_URL` | `http://localhost:8000/api/auth` | Auth endpoints (register/login/refresh/me) |

Both must point at the same backend host. SSE/WebSocket protocol is derived automatically from `VITE_API_BASE_URL` (`http` → `ws`, `https` → `wss`).

---

## Project Structure

```
src/
├── App.jsx                       # Routes + auth gate
├── index.css                     # Global styles, design tokens, toast
├── services/
│   ├── api.js                    # Axios client, JWT refresh, GET dedupe
│   └── auth.js                   # Login/register/refresh, validation error parser
└── components/
    ├── Auth/                     # AuthView — login + register, multi-error UI
    ├── Welcome/                  # WelcomeView — landing + topic prompt
    ├── Sidebar/                  # Topic list (incomplete + completed)
    ├── Curriculum/               # CurriculumChat + PlanningOverlay (background planner state)
    ├── Chat/                     # ChatWindow, Message, QuizCard (teacher + quiz UI)
    ├── Learning/                 # CourseOverview, TopicLearnLayout, ReadingMode, InlineQuiz
    └── Toast.jsx                 # Reusable error toast (auto-dismiss 4s)
```

---

## Backend

The backend is a **FastAPI** application at [`/Users/rudraksh/AI_Tutor`](../AI_Tutor). Run it before starting the frontend.

### Key Backend Modules

```
AI_Tutor/
├── src/
│   ├── main.py                   # FastAPI entrypoint
│   ├── backend/
│   │   ├── app.py                # App factory, CORS, routers
│   │   ├── router.py             # Top-level router aggregation
│   │   ├── auth/                 # JWT, bcrypt, register/login/refresh/me
│   │   ├── topics/               # Topic CRUD + status polling
│   │   ├── chapters/             # Chapter + chapter_plans endpoints
│   │   ├── curriculum/           # SSE curriculum chat
│   │   ├── teacher/              # SSE teacher chat per chapter
│   │   ├── quiz/                 # SSE quiz flow
│   │   ├── planner/              # Background planner trigger
│   │   ├── sidebar/              # Optimized sidebar fetch
│   │   ├── conversations/        # Polymorphic message store
│   │   ├── db/                   # SQLAlchemy 2 async session, models, migrations
│   │   ├── models/               # ORM entities (users, topics, chapters, …)
│   │   ├── enums/                # Status state machines
│   │   ├── shared/               # Helpers shared across routers
│   │   └── config.py             # Settings (env-driven)
│   └── llm/
│       ├── agent_core/           # LangGraph base agent (memory, streaming, tools)
│       ├── curriculum_agent/     # Curriculum negotiation
│       ├── planner/              # Background chapter planner
│       ├── teacher_agent/        # Chapter teacher (sandboxed per chapter)
│       ├── quiz_agent/           # Question generation + evaluation
│       ├── deep_research/        # Multi-agent research pipeline
│       ├── query_expander.py     # Sub-query expansion
│       └── utils.py
├── ai_tutor_architecture.md      # Full architecture document
├── requirments.txt
└── logs/
```

### Running the Backend

```bash
cd /Users/rudraksh/AI_Tutor
pip install -r requirments.txt
# configure backend .env (DB URL, OPENAI_API_KEY, TAVILY_API_KEY, JWT_SECRET, …)
uvicorn src.main:app --reload --port 8000
```

The frontend assumes the backend is at `http://localhost:8000` per `.env.example`.

---

## API Surface (consumed by this frontend)

All endpoints are JWT-authenticated (`Authorization: Bearer <token>`) except register/login.

### Auth (`/api/auth`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/register` | Create account `{email, password, name}` |
| POST | `/login` | Returns `access_token` + `refresh_token` |
| POST | `/refresh` | Exchange refresh token for new access token |
| GET | `/me` | Current user profile |

### REST (`/api/v1`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/topics/start` | Create topic from title |
| GET | `/topics/` | List all topics for current user |
| GET | `/topics/{id}/status` | Poll planner status (`planning_complete`) |
| GET | `/topics/{id}/chapters` | Ordered chapter list with statuses |
| GET | `/chapters/{id}` | Single chapter + chapter_plans |
| GET | `/sidebar/` | Optimized sidebar payload |

### Streaming (`/api/v1/chat/*`, SSE)

| Endpoint | Emits |
| --- | --- |
| POST `/chat/curriculum` | `token`, `planning_started`, `planning_complete`, `done` |
| POST `/chat/teacher` | `token`, `chapter_completed`, `quiz_ready`, `done` |
| POST `/chat/quiz` | `question`, `evaluation`, `quiz_passed`, `done` |

SSE payload format:

```
data: {"type": "token", "data": "Hello"}
data: {"type": "quiz_ready", "chapter_id": "uuid"}
data: {"type": "quiz_passed", "next_chapter_id": "uuid"}
data: {"type": "done"}
```

---

## User Flow

1. **Auth** → register or login. Tokens stored in `localStorage`, scoped per user id.
2. **Welcome** → user enters a topic. `POST /topics/start` → returns `topic_id`.
3. **Curriculum** → SSE stream with Curriculum Agent. User negotiates plan; agent calls `upsert_curriculum` on confirmation. SSE emits `planning_started`.
4. **Planning Overlay** → frontend polls `/topics/{id}/status` every 3s while planner runs in backend background task.
5. **Learning** → on `planning_complete`, redirect to `CourseOverview` showing chapter list (Chapter 1 unlocked).
6. **Teacher Chat** → per-chapter SSE conversation. Teacher Agent marks `chapter_plan.is_completed` as outline items are covered.
7. **Quiz** → on `quiz_ready`, chat UI transitions to `QuizCard`. Quiz Agent streams questions, evaluates answers. Pass ≥ 70%.
8. **Progression** → on `quiz_passed`, next chapter unlocks. Repeat until topic completes.

---

## Frontend Conventions

- **Service layer**: all HTTP via `apiClient` in [src/services/api.js](src/services/api.js). Auto-refresh on 401 with request queueing. GET dedupe scoped per user prevents duplicate fetches when multiple components mount simultaneously.
- **Auth errors**: backend FastAPI validation arrays are parsed in [src/services/auth.js](src/services/auth.js) and surfaced as readable per-field messages (`email`, `password`, `name`).
- **SSE**: handled via streaming `fetch` + manual chunk parsing in `ChatWindow` and `CurriculumChat`.
- **No TypeScript** — plain JSX.
- **No CSS framework** — hand-rolled CSS per component, plus global tokens in [src/index.css](src/index.css).

---

## Known Issues / History

See [BUGFIXES.md](BUGFIXES.md) for documented bugs and their fixes (hardcoded URLs, token scoping, validation error rendering, etc.).

---

## License

See [LICENSE](LICENSE).

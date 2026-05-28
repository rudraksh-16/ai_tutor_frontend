# Frontend Implementation Plan: AI Tutor App

Based on the backend architecture we just finalized, this document outlines the complete plan for building the frontend React application. This plan provides the exact UI structure, routing, and API integration details needed to build the user interface you requested.

## 1. Project Tech Stack
*   **Framework:** React (Next.js or Vite)
*   **Styling:** Tailwind CSS (for rapid, modern UI development) + Lucide React (for icons). Add micro-interactions (hover states, smooth transitions) for a premium feel.
*   **State Management:** React Context or Zustand (to manage user auth and sidebar state).
*   **Data Fetching:** Axios or native `fetch` (for standard REST) + native `EventSource` (for Server-Sent Events / SSE chat streaming).

## 2. Core Layout & Routing Structure

The application will use a standard dashboard layout with a persistent sidebar.

| Route | View Component | Purpose |
| :--- | :--- | :--- |
| `/login` | `AuthView` | User authentication (Login / Register). |
| `/` | `DashboardView` | Landing page. Input field: "Enter topic you want to learn". |
| `/topic/{topic_id}/curriculum` | `CurriculumChatView` | Chat interface with the Curriculum Agent. Shows planning loaders when curriculum is finalized. |
| `/topic/{topic_id}/learn` | `LearningView` | Main learning interface. Multi-panel view (Chapter List, Teacher Chat, Content). |

## 3. UI Component Breakdown & Flow

### A. Persistent Sidebar (`<Sidebar />`)
**Location:** Left side of the screen, visible on all authenticated routes.
**Data Source:** `GET /api/v1/sidebar/`
**Structure:**
*   **Incomplete Topics:** Topics where `status == "pending"` or `"in_progress"`. These should link back to the Curriculum Chat view (`/topic/{id}/curriculum`).
*   **Created Topics:** Topics where `status == "completed"`. These should link directly to the Learning view (`/topic/{id}/learn`).

### B. Landing Page (`<DashboardView />`)
*   **UI:** A clean, centered, premium input area asking: *"What do you want to learn today?"* along with a brief description field.
*   **Action:** Triggers `POST /api/v1/topics/start` with the `title` and `user_summary`.
*   **Next Step:** On success, immediately routes the user to `/topic/{topic_id}/curriculum` to begin building the syllabus.

### C. Curriculum Chat & Planning View (`<CurriculumChatView />`)
*   **UI:** A chat interface specifically connected to the Curriculum Agent.
*   **Interaction:** User chats with the agent to refine their syllabus.
*   **API:** Uses `EventSource` (SSE) pointing to `POST /api/v1/chat/curriculum`.
*   **The Planning Transition (Crucial):**
    *   The backend sends a specific SSE event (`{"type": "planning_started"}`) when the curriculum is finalized and background planning begins.
    *   **Frontend Reaction:** When this event is received, disable the chat input. Display a beautiful loading overlay or side-panel showing a progress bar or spinner: *"Generating lesson plans... "*
    *   **Polling:** Once the planner starts, frontend begins polling `GET /api/v1/topics/{topic_id}/status` every 3 seconds.
    *   **Completion:** Iterate the UI as `planned_chapters` approaches `total_chapters`. When `planning_complete == true`, display a *"Plan Ready! Let's Start Learning"* button that redirects to `/topic/{topic_id}/learn`.

### D. The Main Learning Interface (`<LearningView />`)
This is a three-pane layout (or two-pane depending on screen size).
*   **Left Pane (Chapter Index):**
    *   Data: `GET /api/v1/topics/{topic_id}/chapters`
    *   Displays all chapters.
    *   **Access Control Logic:** Visually lock (grey out, disable clicks) any chapters that are `status == "pending"`. Only allow clicking chapters that are `in_progress` or `completed`.
*   **Center/Right Pane (Teacher UI):**
    *   When the user clicks an unlocked chapter, it fetches `GET /api/v1/conversations/chapter/{chapter_id}/messages` to load context.
    *   The user chats with the Teacher Agent via SSE (`POST /api/v1/chat/teacher`).
    *   When a chapter is finished, a button or LLM action triggers `POST /api/v1/chapters/{chapter_id}/complete`, which unlocks the *next* chapter. Refresh the Chapter Index pane so the next chapter becomes clickable.

## 4. API Integration Mapping

Here is the exact mapping the frontend will use against the backend we just built:

1.  **Start Topic:** `POST /api/v1/topics/start` -> Returns `{ id }`
2.  **Sidebar Data:** `GET /api/v1/sidebar/` -> Returns `{ in_progress: [], completed: [] }`
3.  **Chat (Curriculum):** `POST /api/v1/chat/curriculum` -> SSE Stream. Listen for `type: "planning_started"`.
4.  **Poll Planner Status:** `GET /api/v1/topics/{topic_id}/status` -> Poll this until `planning_complete: true`.
5.  **Get Chapters:** `GET /api/v1/topics/{topic_id}/chapters` -> Render chapter list, enforce locks on `pending` status.
6.  **Chat (Teacher):** `POST /api/v1/chat/teacher` -> SSE Stream for teaching.
7.  **Complete Chapter:** `POST /api/v1/chapters/{chapter_id}/complete` -> Unlocks next chapter.

---

## User Review Required

> [!WARNING]
> This plan acts as the blueprint for the Frontend layer. Please review it. Do you approve this structure? Once approved, we can either consider this task complete, or if you would like me to actively build the React codebase based on this plan, just let me know!

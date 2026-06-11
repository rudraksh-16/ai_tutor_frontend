import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useParams, Navigate, useLocation } from 'react-router-dom';
import { Sidebar } from './components/Sidebar/Sidebar';
import { CurriculumChat } from './components/Curriculum/CurriculumChat';
import { AuthView } from './components/Auth/AuthView';
import { WelcomeView } from './components/Welcome/WelcomeView';
import { TopicLearnLayout } from './components/Learning/TopicLearnLayout';
import { apiService } from './services/api';
import { authService } from './services/auth';
import './index.css';

// ─── Protected Route ──────────────────────────────────────
const ProtectedRoute = ({ children }) => {
  const token = authService.getToken();
  const userId = authService.getCurrentUserId();
  if (!token || !userId) {
    return <Navigate to="/auth" replace />;
  }
  return <>{children}</>;
};

// ─── Curriculum Wrapper ───────────────────────────────────
const CurriculumChatWrapper = ({ onRefreshSidebar }) => {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!topicId) return;
    const controller = new AbortController();

    const checkRedirect = async () => {
      try {
        const status = await apiService.getPlanningStatus(topicId, controller.signal);
        if (status.planning_complete) {
          navigate(`/topic/${topicId}/learn`, { replace: true });
        } else {
          setChecking(false);
        }
      } catch (err) {
        if (err.code === 'ERR_CANCELED') return;
        console.error('Guard check failed:', err);
        setChecking(false);
      }
    };

    checkRedirect();
    return () => controller.abort();
  }, [topicId, navigate]);

  if (!topicId) return <Navigate to="/" replace />;
  if (checking) return null; // Or a small spinner

  return (
    <CurriculumChat
      key={topicId}
      topicId={topicId}
      onRefreshSidebar={onRefreshSidebar}
    />
  );
};

// ─── Main App ─────────────────────────────────────────────
function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!authService.getToken());
  const [refreshKey, setRefreshKey] = useState(0);
  const [isCreatingTopic, setIsCreatingTopic] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const refreshSidebar = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  const handleAuthSuccess = () => {
    setIsAuthenticated(true);
    navigate('/');
  };

  const handleLogout = () => {
    authService.clearSession();
    setIsAuthenticated(false);
    navigate('/auth');
  };

  const handleCreateTopic = async (title) => {
    if (!title || isCreatingTopic) return;
    const userSummary = `I want to learn ${title}`;

    try {
      setIsCreatingTopic(true);
      const newTopic = await apiService.startTopic(title, userSummary);
      refreshSidebar();
      navigate(`/topic/${newTopic.id}/curriculum`);
    } catch (err) {
      alert('AI Tutor could not create this topic. Please try again.');
      console.error(err);
    } finally {
      setIsCreatingTopic(false);
    }
  };

  // Check if we are in the specialized learning layout
  const isLearningRoute = location.pathname.includes('/learn');

  return (
    <Routes>
      <Route path="/auth" element={<AuthView onAuthSuccess={handleAuthSuccess} />} />

      <Route
        path="*"
        element={
          <ProtectedRoute>
            <div className="app-container">
              {/* Show main sidebar ONLY if not in learning mode */}
              {!isLearningRoute && (
                <Sidebar
                  refreshKey={refreshKey}
                  onLogout={handleLogout}
                />
              )}

              <Routes>
                {/* Home / Welcome */}
                <Route
                  path="/"
                  element={
                    <WelcomeView
                      onCreateTopic={handleCreateTopic}
                      isLoading={isCreatingTopic}
                    />
                  }
                />

                {/* Curriculum negotiation chat */}
                <Route
                  path="/topic/:topicId/curriculum"
                  element={<CurriculumChatWrapper onRefreshSidebar={refreshSidebar} />}
                />

                {/* Specialized Learning Layout (Chapter Sidebar + Detail/Chat) */}
                <Route
                  path="/topic/:topicId/learn"
                  element={<TopicLearnLayout onRefreshSidebar={refreshSidebar} />}
                />
                <Route
                  path="/topic/:topicId/learn/:chapterId"
                  element={<TopicLearnLayout onRefreshSidebar={refreshSidebar} />}
                />
              </Routes>
            </div>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;

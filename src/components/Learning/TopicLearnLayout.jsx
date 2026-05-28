import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  BookOpen,
  CheckCircle,
  Loader2,
  Lock,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import { apiService } from '../../services/api';
import { ChatWindow } from '../Chat/ChatWindow';
import { useTheme } from '../../hooks/useTheme';
import './TopicLearnLayout.css';

const CHAPTER_STATE = {
  LOCKED: 'locked',
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  QUIZ_PENDING: 'quiz_pending',
  COMPLETED: 'completed',
};

const VIEW_MODE = {
  OVERVIEW: 'overview',
  READING: 'reading',
  TEACHER: 'teacher',
};

const getChapterStatus = (chapter) => {
  const currentStatus = (chapter?.status || '').toLowerCase();

  if (currentStatus === 'completed') return CHAPTER_STATE.COMPLETED;
  if (currentStatus === 'quiz_pending') return CHAPTER_STATE.QUIZ_PENDING;
  if (currentStatus === 'in_progress') return CHAPTER_STATE.IN_PROGRESS;
  if (currentStatus === 'pending') return CHAPTER_STATE.PENDING;
  return CHAPTER_STATE.LOCKED;
};

const getDefaultView = (chapter) => {
  const status = getChapterStatus(chapter);
  if (status === CHAPTER_STATE.LOCKED) return VIEW_MODE.OVERVIEW;
  return VIEW_MODE.TEACHER;
};

const getStatusLabel = (status) => {
  switch (status) {
    case CHAPTER_STATE.PENDING:
      return 'Ready';
    case CHAPTER_STATE.IN_PROGRESS:
      return 'Learning';
    case CHAPTER_STATE.QUIZ_PENDING:
      return 'Quiz Ready';
    case CHAPTER_STATE.COMPLETED:
      return 'Completed';
    default:
      return 'Locked';
  }
};

export const TopicLearnLayout = ({ onRefreshSidebar }) => {
  const { topicId, chapterId: urlChapterId } = useParams();
  const navigate = useNavigate();

  const [topic, setTopic] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { theme, toggleTheme } = useTheme();
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [viewMode, setViewMode] = useState(VIEW_MODE.OVERVIEW);

  const loadLearningData = useCallback(async (signal) => {
    if (!topicId) return;

    setLoading(true);
    setError(null);

    try {
      const [topicData, chaptersData] = await Promise.all([
        apiService.getTopic(topicId, signal),
        apiService.getTopicChapters(topicId, signal),
      ]);

      const sortedChapters = (chaptersData || []).sort((a, b) => a.order_index - b.order_index);
      setTopic(topicData);
      setChapters(sortedChapters);

      setSelectedChapterId((currentSelected) => {
        if (urlChapterId) {
          const requested = sortedChapters.find((chapter) => chapter.id === urlChapterId);
          if (requested && getChapterStatus(requested) !== CHAPTER_STATE.LOCKED) {
            return requested.id;
          }
        }

        if (currentSelected && sortedChapters.some((chapter) => chapter.id === currentSelected)) {
          return currentSelected;
        }

        return sortedChapters.find((chapter) => getChapterStatus(chapter) !== CHAPTER_STATE.LOCKED)?.id
          || sortedChapters[0]?.id
          || null;
      });
    } catch (err) {
      if (err.code === 'ERR_CANCELED') return;
      console.error('Failed to load learning view:', err);
      setError('We could not load this learning space. Please refresh and try again.');
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [topicId, urlChapterId]);

  useEffect(() => {
    const controller = new AbortController();
    loadLearningData(controller.signal);
    return () => controller.abort();
  }, [loadLearningData]);

  useEffect(() => {
    if (!chapters.length || !urlChapterId) return;

    const requestedChapter = chapters.find((chapter) => chapter.id === urlChapterId);
    if (!requestedChapter) return;

    if (getChapterStatus(requestedChapter) === CHAPTER_STATE.LOCKED) {
      navigate(`/topic/${topicId}/learn`, { replace: true });
      return;
    }

    setSelectedChapterId(requestedChapter.id);
    setViewMode(getDefaultView(requestedChapter));
  }, [chapters, navigate, topicId, urlChapterId]);

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === selectedChapterId) || null,
    [chapters, selectedChapterId]
  );

  const selectedStatus = selectedChapter ? getChapterStatus(selectedChapter) : CHAPTER_STATE.LOCKED;
  const completedCount = useMemo(
    () => chapters.filter((chapter) => getChapterStatus(chapter) === CHAPTER_STATE.COMPLETED).length,
    [chapters]
  );

  const handleSelectChapter = useCallback((chapter) => {
    if (getChapterStatus(chapter) === CHAPTER_STATE.LOCKED) return;

    setSelectedChapterId(chapter.id);
    setViewMode(getDefaultView(chapter));
    navigate(`/topic/${topicId}/learn/${chapter.id}`, { replace: true });
  }, [navigate, topicId]);

  const handleOpenTeacher = useCallback(() => {
    if (!selectedChapter || selectedStatus === CHAPTER_STATE.LOCKED) return;
    setViewMode(VIEW_MODE.TEACHER);
  }, [selectedChapter, selectedStatus]);

  const handleChapterCompleted = useCallback(async () => {
    await loadLearningData();
    onRefreshSidebar?.();
  }, [loadLearningData, onRefreshSidebar]);

  useEffect(() => {
    if (!selectedChapterId || !chapters.length) return;
    const chapter = chapters.find((c) => c.id === selectedChapterId);
    if (!chapter) return;
    setViewMode(
      getChapterStatus(chapter) !== CHAPTER_STATE.LOCKED ? VIEW_MODE.TEACHER : VIEW_MODE.OVERVIEW
    );
  }, [selectedChapterId]);

  const handleBackToHome = () => navigate('/');

  if (loading) {
    return (
      <div className="tl-loading">
        <Loader2 size={32} className="animate-spin" />
        <p>Loading your learning environment...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tl-loading">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="tl-container">
      <div className="tl-sidebar">
        <div className="tl-sidebar-back">
          <div className="tl-sidebar-brand" onClick={handleBackToHome} style={{ cursor: 'pointer' }}>
            <BookOpen size={18} className="tl-logo-icon" />
            <span className="tl-logo-text">AI Tutor</span>
          </div>
          <div className="tl-sidebar-back-actions">
            <button className="tl-back-icon-btn" onClick={handleBackToHome} title="Go Home">
              <ArrowLeft size={16} />
            </button>
            <button className="tl-back-icon-btn" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </div>

        <div className="tl-sidebar-header">
          <span className="tl-sidebar-meta">Current Course</span>
          <h2 className="tl-sidebar-title">{topic?.title || 'Topic'}</h2>

          {chapters.length > 0 && (
            <div className="tl-progress-container">
              <div className="tl-progress-text">
                <span>Progress</span>
                <span>{Math.round((completedCount / chapters.length) * 100)}%</span>
              </div>
              <div className="tl-progress">
                <div
                  className="tl-progress-fill"
                  style={{ width: `${(completedCount / chapters.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="tl-chapter-list">
          {chapters.map((chapter) => {
            const status = getChapterStatus(chapter);
            const isSelected = chapter.id === selectedChapterId;
            const isLocked = status === CHAPTER_STATE.LOCKED;

            return (
              <div
                key={chapter.id}
                className={`tl-chapter-item ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                onClick={() => !isLocked && handleSelectChapter(chapter)}
                style={{ cursor: isLocked ? 'not-allowed' : 'pointer' }}
              >
                <div className="tl-chapter-info">
                  <span className="tl-chapter-name">{chapter.title}</span>
                  <span className={`tl-sidebar-status-badge tl-sidebar-status-${status}`}>
                    {getStatusLabel(status)}
                  </span>
                </div>
                <div className="tl-chapter-status">
                  {status === CHAPTER_STATE.COMPLETED ? (
                    <CheckCircle size={16} className="tl-status-done" />
                  ) : status === CHAPTER_STATE.LOCKED ? (
                    <Lock size={16} className="tl-status-locked" />
                  ) : (
                    <div className="tl-status-dot" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="tl-content">
        <div className="tl-main-area">
          {selectedChapter ? (
            <>
              <div className="tl-mode-header glass">
                <div className="tl-mode-info">
                  <h3 className="tl-mode-title">{selectedChapter.title}</h3>
                </div>

                <button
                  className="tl-toggle-btn active"
                  onClick={handleOpenTeacher}
                  disabled={selectedStatus === CHAPTER_STATE.LOCKED}
                >
                  <Bot size={14} />
                  Teacher
                </button>
              </div>

              <div className="tl-panel-area">
                {viewMode === VIEW_MODE.TEACHER ? (
                  <div className="tl-chat-area">
                    <ChatWindow
                      key={`teacher-${selectedChapter.id}`}
                      chapterId={selectedChapter.id}
                      onChapterCompleted={handleChapterCompleted}
                    />
                  </div>
                ) : (
                  <div className="tl-detail">
                    <div className="tl-detail-card glass">
                      <div className="tl-detail-number">{selectedChapter.order_index}</div>
                      <h2 className="tl-detail-title">{selectedChapter.title}</h2>

                      <div className={`tl-detail-badge tl-badge-${selectedStatus}`}>
                        {selectedStatus === CHAPTER_STATE.COMPLETED ? <CheckCircle size={14} /> : <Sparkles size={14} />}
                        <span>{getStatusLabel(selectedStatus)}</span>
                      </div>

                      <div className="tl-detail-outline">
                        <h3>Chapter Description</h3>
                        <p>{selectedChapter.description || 'No description yet.'}</p>
                      </div>

                      {selectedStatus === CHAPTER_STATE.LOCKED && (
                        <div className="tl-locked-msg">
                          <Lock size={18} />
                          <span>Finish the previous chapter first to unlock this one.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="tl-empty">
              <Sparkles size={28} />
              <h2>No chapter is available yet</h2>
              <p>Finish planning the curriculum first, then come back here to learn.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { ChatWindow } from '../Chat/ChatWindow';
import { ReadingMode } from './ReadingMode';
import {
  ArrowLeft, BookOpen, Lock, CheckCircle, Activity,
  PlayCircle, ChevronRight, ChevronDown, Loader2, GraduationCap,
  RotateCcw, BookOpenText, Bot, LayoutGrid, Play
} from 'lucide-react';
import { CourseOverview } from './CourseOverview';
import './TopicLearnLayout.css';

// ─── Constants ───
const CHAPTER_STATE = {
  LOCKED: 'locked',
  NOT_STARTED: 'not_started',
  PENDING: 'pending',
  GENERATING: 'generating',
  IN_PROGRESS: 'in_progress',
  QUIZ_PENDING: 'quiz_pending',
  COMPLETED: 'completed'
};

const VIEW_MODE = {
  OVERVIEW: 'overview',
  DETAIL: 'detail',
  READ: 'read',
  CHAT: 'chat',
};

// ─── Helpers ───
const getChapterStatus = (chapter) => {
  const currentStatus = (chapter.status || '').toLowerCase();

  if (currentStatus === 'completed') return CHAPTER_STATE.COMPLETED;
  if (currentStatus === 'quiz_pending') return CHAPTER_STATE.QUIZ_PENDING;
  if (currentStatus === 'in_progress') return CHAPTER_STATE.IN_PROGRESS;
  if (currentStatus === 'generating') return CHAPTER_STATE.GENERATING;
  if (currentStatus === 'pending') return CHAPTER_STATE.PENDING;
  if (currentStatus === 'locked') return CHAPTER_STATE.LOCKED;

  return CHAPTER_STATE.LOCKED;
};

const getStatusIcon = (state) => {
  switch (state) {
    case CHAPTER_STATE.COMPLETED: return <CheckCircle size={14} className="tl-status-done" />;
    case CHAPTER_STATE.IN_PROGRESS: return <Activity size={14} className="tl-status-active" />;
    case CHAPTER_STATE.LOCKED: return <Lock size={14} className="tl-status-locked" />;
    default: return <div className="tl-status-dot" />;
  }
};

export const TopicLearnLayout = ({ onRefreshSidebar }) => {
  const { topicId, chapterId: urlChapterId } = useParams();
  const navigate = useNavigate();

  const [topic, setTopic] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedChapterId, setSelectedChapterId] = useState(null);
  const [viewMode, setViewMode] = useState(VIEW_MODE.DETAIL);
  const [sections, setSections] = useState([]);
  const [allSectionsMap, setAllSectionsMap] = useState({});
  const [expandedChapterId, setExpandedChapterId] = useState(null);
  const [requestedSectionIndex, setRequestedSectionIndex] = useState(null);
  const [generatingSidebarId, setGeneratingSidebarId] = useState(null);

  // ─── Data Fetching ───
  const fetchTopicData = useCallback(async () => {
    if (!topicId) return;
    try {
      const topicData = await apiService.getTopic(topicId);
      setTopic(topicData);
    } catch (err) {
      console.error('Failed to load topic details', err);
    }
  }, [topicId]);

  const fetchChaptersData = useCallback(async () => {
    if (!topicId) return;
    try {
      const chaptersData = await apiService.getTopicChapters(topicId);
      const sortedChapters = (chaptersData || []).sort((a, b) => a.order_index - b.order_index);
      setChapters(sortedChapters);

      if (!selectedChapterId) {
        if (urlChapterId) {
          setSelectedChapterId(urlChapterId);
          setExpandedChapterId(urlChapterId);
          setViewMode(VIEW_MODE.READ);
        } else if (sortedChapters.length > 0) {
          const latestInProgress = [...sortedChapters]
            .reverse()
            .find(c => (c.status || '').toLowerCase() === 'in_progress');

          const firstUnlocked = sortedChapters.find((c) =>
            getChapterStatus(c) !== CHAPTER_STATE.LOCKED
          );

          const autoSelect = latestInProgress || firstUnlocked || sortedChapters[0];
          setSelectedChapterId(autoSelect.id);

          const autoState = getChapterStatus(autoSelect);
          if (autoState === CHAPTER_STATE.IN_PROGRESS) {
            setExpandedChapterId(autoSelect.id);
            setViewMode(VIEW_MODE.READ);
            navigate(`/topic/${topicId}/learn/${autoSelect.id}`, { replace: true });
          }
        }
      }
    } catch (err) {
      console.error('Failed to load chapters', err);
    } finally {
      setLoading(false);
    }
  }, [topicId, urlChapterId, selectedChapterId, navigate]);

  const fetchAllSections = useCallback(async () => {
    if (!chapters.length) return;
    const unlocked = chapters.filter(c => getChapterStatus(c) !== CHAPTER_STATE.LOCKED);
    
    let hasNew = false;
    const updates = {};

    await Promise.all(unlocked.map(async (ch) => {
      try {
        const data = await apiService.getChapterDocument(ch.id);
        if (Array.isArray(data)) {
          updates[ch.id] = data;
          hasNew = true;
        }
      } catch (err) { /* ignore */ }
    }));

    if (hasNew) {
      setAllSectionsMap(prev => ({ ...prev, ...updates }));
    }
  }, [chapters]);

  useEffect(() => {
    if (chapters.length > 0) {
      fetchAllSections();
    }
  }, [chapters, fetchAllSections]);

  useEffect(() => {
    setLoading(true);
    fetchTopicData();
    fetchChaptersData();
  }, [topicId, fetchTopicData, fetchChaptersData]);

  // ─── Navigation Guard ───
  useEffect(() => {
    if (urlChapterId && chapters.length > 0) {
      const idx = chapters.findIndex(c => c.id === urlChapterId);
      if (idx !== -1) {
        const state = getChapterStatus(chapters[idx]);
        if (state === CHAPTER_STATE.LOCKED) {
          navigate(`/topic/${topicId}/learn`, { replace: true });
        }
      }
    }
  }, [urlChapterId, chapters, topicId, navigate]);

  // ─── Handlers ───
  const handleSelectChapter = useCallback((chapterId) => {
    setSelectedChapterId(chapterId);
    setExpandedChapterId(prev => prev === chapterId ? null : chapterId);
    setRequestedSectionIndex(null);

    const chapter = chapters.find(c => c.id === chapterId);
    const state = chapter ? getChapterStatus(chapter) : null;
    const isActive = state === CHAPTER_STATE.IN_PROGRESS || state === CHAPTER_STATE.COMPLETED ||
                     state === CHAPTER_STATE.QUIZ_PENDING || state === CHAPTER_STATE.GENERATING;

    if (isActive) {
      setViewMode(VIEW_MODE.READ);
      navigate(`/topic/${topicId}/learn/${chapterId}`, { replace: true });
    } else {
      setViewMode(VIEW_MODE.DETAIL);
      navigate(`/topic/${topicId}/learn`, { replace: true });
    }
  }, [topicId, navigate, chapters]);

  const handleNavigateToChapter = useCallback((chapterId, sectionIndex = null) => {
    setSelectedChapterId(chapterId);
    setExpandedChapterId(chapterId);
    setRequestedSectionIndex(sectionIndex);
    setViewMode(VIEW_MODE.READ);
    navigate(`/topic/${topicId}/learn/${chapterId}`);
  }, [topicId, navigate]);

  const handleTriggerGeneration = async (chapterId) => {
    setGeneratingSidebarId(chapterId);
    try {
      await apiService.triggerChapterGeneration(chapterId);
      let count = 0;
      const interval = setInterval(async () => {
        count++;
        if (count > 30) clearInterval(interval);
        try {
          const ch = await apiService.getChapter(chapterId);
          if (ch.status === 'in_progress') {
            clearInterval(interval);
            setGeneratingSidebarId(null);
            fetchChaptersData();
          }
        } catch { /* ignore */ }
      }, 3000);
    } catch (err) {
      console.error("Manual generation failed", err);
      setGeneratingSidebarId(null);
    }
  };

  const handleStartLearning = useCallback((chapterId) => {
    setExpandedChapterId(chapterId);
    setViewMode(VIEW_MODE.READ);
    navigate(`/topic/${topicId}/learn/${chapterId}`, { replace: true });
  }, [topicId, navigate]);

  const handleSwitchToChat = useCallback(() => {
    setViewMode(VIEW_MODE.CHAT);
  }, []);

  const handleSwitchToRead = useCallback(() => {
    setViewMode(VIEW_MODE.READ);
  }, []);

  const handleChapterCompleted = useCallback(() => {
    fetchChaptersData();
    if (onRefreshSidebar) onRefreshSidebar();
  }, [fetchChaptersData, onRefreshSidebar]);

  const handleSectionsLoaded = useCallback((loadedSections) => {
    setSections(loadedSections);
  }, []);

  const handleBackToHome = () => navigate('/');

  // ─── Computed Values ───
  const selectedChapter = useMemo(() =>
    chapters.find(c => c.id === selectedChapterId),
    [chapters, selectedChapterId]
  );

  const selectedState = selectedChapter
    ? getChapterStatus(selectedChapter)
    : null;

  const completedCount = useMemo(() =>
    chapters.filter(c => (c.status || '').toLowerCase() === 'completed').length,
    [chapters]
  );

  const isContentMode = viewMode === VIEW_MODE.READ || viewMode === VIEW_MODE.CHAT;

  const nextGeneratableId = useMemo(() => {
    if (!chapters.length) return null;
    const sorted = [...chapters].sort((a, b) => a.order_index - b.order_index);
    for (const ch of sorted) {
      const state = getChapterStatus(ch);
      if (state === CHAPTER_STATE.PENDING) return ch.id;
      if (state === CHAPTER_STATE.GENERATING || state === CHAPTER_STATE.IN_PROGRESS) {
        if (state === CHAPTER_STATE.GENERATING) return null;
        continue;
      }
    }
    return null;
  }, [chapters]);

  return (
    <div className="tl-container">
      {loading && !topic ? (
        <div className="tl-loading">
          <Loader2 size={32} className="animate-spin" />
          <p>Loading your learning environment...</p>
        </div>
      ) : (
        <>
          <div className="tl-sidebar">
            <div className="tl-sidebar-back">
              <button className="tl-back-btn" onClick={handleBackToHome}>
                <ArrowLeft size={18} />
                <span>Home</span>
              </button>
            </div>

            <div className="tl-sidebar-header">
              <span className="tl-sidebar-meta">CURRENT COURSE</span>
              <h2 className="tl-sidebar-title">{topic?.title || 'Topic'}</h2>
              
              {chapters.length > 0 && (
                <div className="tl-progress-container">
                  <div className="tl-progress-text">
                    <span>OVERALL PROGRESS</span>
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
                const state = getChapterStatus(chapter);
                const isSelected = chapter.id === selectedChapterId;
                const isExpanded = chapter.id === expandedChapterId;
                const isLocked = state === CHAPTER_STATE.LOCKED;

                return (
                  <div key={chapter.id} className="tl-chapter-group">
                    <div
                      className={`tl-chapter-item ${isSelected ? 'selected' : ''} ${isLocked ? 'locked' : ''}`}
                      onClick={() => !isLocked && handleSelectChapter(chapter.id)}
                      style={{ cursor: isLocked ? 'default' : 'pointer' }}
                    >
                      <div className="tl-chapter-info">
                        <span className="tl-chapter-name">
                          {chapter.order_index < 10 ? `0${chapter.order_index}` : chapter.order_index}. {chapter.title}
                        </span>
                        {isSelected && <span className="tl-chapter-active-label">CHAPTER ACTIVE</span>}
                      </div>

                      <div className="tl-chapter-status">
                        {state === CHAPTER_STATE.COMPLETED && (
                          <div className="tl-pill-completed">COMPLETED</div>
                        )}
                        {(state === CHAPTER_STATE.PENDING || state === CHAPTER_STATE.LOCKED) && !generatingSidebarId && (
                          <button
                            className="tl-sidebar-gen-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTriggerGeneration(chapter.id);
                            }}
                            title="Generate content now"
                            style={{ cursor: 'pointer' }}
                          >
                            <Play size={12} fill="currentColor" />
                          </button>
                        )}
                        {(state === CHAPTER_STATE.GENERATING || generatingSidebarId === chapter.id) && (
                          <div className="tl-sidebar-gen-spinner">
                            <Loader2 size={14} className="animate-spin" />
                          </div>
                        )}
                      </div>
                    </div>

                    {isExpanded && sections.length > 0 && isSelected && (
                      <div className="tl-subtopic-list">
                        {sections.map((section, idx) => {
                          const firstIncomplete = sections.findIndex(s => !s.is_completed);
                          const maxAllowed = firstIncomplete === -1 ? sections.length : firstIncomplete;
                          const isUnlocked = idx <= maxAllowed;
                          const isActive = isUnlocked && !section.is_completed && idx === firstIncomplete;

                          return (
                            <div
                              key={section.id}
                              className={`tl-subtopic-item ${section.is_completed ? 'done' : ''} ${isActive ? 'active' : ''} ${!isUnlocked ? 'locked' : ''}`}
                              style={{ cursor: isUnlocked ? 'pointer' : 'not-allowed' }}
                              onClick={() => {
                                if (isUnlocked) {
                                  setRequestedSectionIndex(idx);
                                  if (viewMode !== VIEW_MODE.READ) setViewMode(VIEW_MODE.READ);
                                }
                              }}
                            >
                              <div className="tl-subtopic-indicator">
                                {section.is_completed ? (
                                  <CheckCircle size={18} className="tl-status-done" />
                                ) : (
                                  <div className="tl-subtopic-num">{idx + 1}</div>
                                )}
                              </div>
                              <span className="tl-subtopic-name">
                                {chapter.order_index}.{idx + 1} {section.title}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="tl-content">
            {viewMode === VIEW_MODE.OVERVIEW || !selectedChapter ? (
              <CourseOverview 
                chapters={chapters}
                allSectionsMap={allSectionsMap}
                onNavigateToChapter={handleNavigateToChapter}
                onChaptersChanged={fetchChaptersData}
              />
            ) : isContentMode && selectedState !== CHAPTER_STATE.LOCKED ? (
              <div className="tl-main-area">
                <div className="tl-mode-header glass">
                  <div className="tl-mode-info">
                    <span className="tl-mode-chapter-label">TOPIC {selectedChapter.order_index}</span>
                    <div className="tl-mode-dot" />
                    <h3 className="tl-mode-title">{selectedChapter.title}</h3>
                  </div>

                  <div className="tl-mode-toggle">
                    <button
                      className={`tl-toggle-btn ${viewMode === VIEW_MODE.OVERVIEW ? 'active' : ''}`}
                      onClick={() => setViewMode(VIEW_MODE.OVERVIEW)}
                    >
                      <LayoutGrid size={14} />
                      Course Overview
                    </button>
                    <div className="tl-toggle-divider" />
                    <button
                      className={`tl-toggle-btn ${viewMode === VIEW_MODE.READ ? 'active' : ''}`}
                      onClick={handleSwitchToRead}
                    >
                      <BookOpenText size={14} />
                      Reading Mode
                    </button>
                    <button
                      className={`tl-toggle-btn ${viewMode === VIEW_MODE.CHAT ? 'active' : ''}`}
                      onClick={handleSwitchToChat}
                    >
                      <Bot size={14} />
                      Teacher Mode
                    </button>
                  </div>
                </div>

                <div className="tl-panel-area">
                  {viewMode === VIEW_MODE.READ ? (
                    <ReadingMode
                      key={selectedChapterId}
                      chapterId={selectedChapterId}
                      chapterTitle={selectedChapter.title}
                      forceViewIndex={requestedSectionIndex}
                      onSwitchToChat={handleSwitchToChat}
                      onSectionsLoaded={handleSectionsLoaded}
                    />
                  ) : (
                    <div className="tl-chat-area">
                      <ChatWindow
                        key={selectedChapterId}
                        chapterId={selectedChapterId}
                        chapterTitle={selectedChapter.title}
                        onChapterCompleted={handleChapterCompleted}
                      />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="tl-detail">
                <div className="tl-detail-card glass">
                  <div className="tl-detail-number">{selectedChapter.order_index}</div>
                  <h1 className="tl-detail-title">{selectedChapter.title}</h1>

                  <div className={`tl-detail-badge tl-badge-${selectedState}`}>
                    {getStatusIcon(selectedState)}
                    <span>{selectedState?.replace('_', ' ')}</span>
                  </div>

                  {selectedChapter.description && (
                    <div className="tl-detail-outline">
                      <h3>Chapter Description</h3>
                      <p>{selectedChapter.description}</p>
                    </div>
                  )}

                  <div className="tl-cta-container">
                    {selectedState === CHAPTER_STATE.LOCKED ? (
                      <div className="tl-locked-msg">
                        <Lock size={18} />
                        <span>Complete the previous chapter to unlock this one.</span>
                      </div>
                    ) : selectedState === CHAPTER_STATE.COMPLETED ? (
                      <button className="tl-start-btn tl-btn-completed" onClick={() => handleStartLearning(selectedChapter.id)}>
                        <RotateCcw size={20} />
                        Review Content
                      </button>
                    ) : selectedState === CHAPTER_STATE.IN_PROGRESS ? (
                      <button className="tl-start-btn tl-btn-active" onClick={() => handleStartLearning(selectedChapter.id)}>
                        <Activity size={20} />
                        Continue Learning
                      </button>
                    ) : (
                      <button className="tl-start-btn" onClick={() => handleStartLearning(selectedChapter.id)}>
                        <PlayCircle size={22} />
                        Start Learning
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import {
  BookOpen, Code, Database, Globe, Gauge, TestTube2,
  Layers, Shield, Sparkles, Terminal, Lock, Loader2,
  CheckCircle, Play, ChevronDown, ChevronUp, Zap,
  Settings, Palette, Brain, FileText, GitBranch,
  Component, LayoutGrid, Workflow, Server
} from 'lucide-react';
import { apiService } from '../../services/api';
import './CourseOverview.css';

// ─── Keyword → Icon Mapping ───
const ICON_MAP = [
  { keywords: ['introduction', 'getting started', 'overview', 'fundamentals', 'basics'], icon: BookOpen },
  { keywords: ['component', 'ui', 'interface', 'layout', 'design'], icon: Component },
  { keywords: ['state', 'management', 'redux', 'context'], icon: Layers },
  { keywords: ['performance', 'optimization', 'speed', 'lazy'], icon: Gauge },
  { keywords: ['test', 'testing', 'jest', 'unit', 'integration'], icon: TestTube2 },
  { keywords: ['architecture', 'pattern', 'structure', 'clean'], icon: LayoutGrid },
  { keywords: ['security', 'auth', 'authentication', 'authorization'], icon: Shield },
  { keywords: ['api', 'rest', 'graphql', 'server', 'backend'], icon: Server },
  { keywords: ['hook', 'effect', 'side effect', 'lifecycle'], icon: Workflow },
  { keywords: ['style', 'css', 'theme', 'animation'], icon: Palette },
  { keywords: ['data', 'database', 'storage', 'query'], icon: Database },
  { keywords: ['deploy', 'build', 'ci', 'devops', 'terminal'], icon: Terminal },
  { keywords: ['ai', 'machine learning', 'neural', 'deep'], icon: Brain },
  { keywords: ['code', 'programming', 'syntax', 'javascript', 'python', 'react'], icon: Code },
  { keywords: ['config', 'setting', 'environment', 'setup'], icon: Settings },
  { keywords: ['routing', 'navigation', 'route', 'page'], icon: GitBranch },
  { keywords: ['web', 'http', 'network', 'browser'], icon: Globe },
  { keywords: ['document', 'file', 'read', 'write'], icon: FileText },
  { keywords: ['advanced', 'pro', 'expert', 'scaling'], icon: Zap },
];

const getChapterIcon = (title) => {
  const lower = title.toLowerCase();
  for (const entry of ICON_MAP) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return entry.icon;
    }
  }
  return Sparkles; // Fallback
};

const CHAPTER_STATE = {
  LOCKED: 'locked',
  PENDING: 'pending',
  GENERATING: 'generating',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
};

const getState = (ch) => {
  const s = (ch.status || '').toLowerCase();
  if (s === 'completed') return CHAPTER_STATE.COMPLETED;
  if (s === 'in_progress' || s === 'quiz_pending') return CHAPTER_STATE.IN_PROGRESS;
  if (s === 'generating') return CHAPTER_STATE.GENERATING;
  if (s === 'locked') return CHAPTER_STATE.LOCKED;
  return CHAPTER_STATE.PENDING;
};

export const CourseOverview = ({
  chapters,
  allSectionsMap,
  onNavigateToChapter,
  onChaptersChanged,
}) => {
  const [expandedId, setExpandedId] = useState(null);
  const [generatingIds, setGeneratingIds] = useState(new Set());
  const pollIntervalsRef = useRef(new Set());

  useEffect(() => {
    return () => {
      pollIntervalsRef.current.forEach(clearInterval);
    };
  }, []);

  // Determine the "next sequential" chapter that can be generated
  const nextGeneratableId = (() => {
    const sorted = [...chapters].sort((a, b) => a.order_index - b.order_index);
    for (const ch of sorted) {
      const state = getState(ch);
      if (state === CHAPTER_STATE.PENDING) return ch.id;
      if (state === CHAPTER_STATE.GENERATING) return null; // one at a time
    }
    return null;
  })();

  const handleGenerate = async (chapterId) => {
    setGeneratingIds(prev => new Set([...prev, chapterId]));
    try {
      await apiService.triggerChapterGeneration(chapterId);
      // Start polling to detect completion
      pollChapterStatus(chapterId);
    } catch (err) {
      console.error('Failed to trigger generation:', err);
      setGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(chapterId);
        return next;
      });
    }
  };

  const pollChapterStatus = (chapterId) => {
    let count = 0;
    const interval = setInterval(async () => {
      count++;
      if (count > 40) {
        clearInterval(interval);
        pollIntervalsRef.current.delete(interval);
        setGeneratingIds(prev => {
          const next = new Set(prev);
          next.delete(chapterId);
          return next;
        });
        return;
      }
      try {
        const ch = await apiService.getChapter(chapterId);
        const state = (ch.status || '').toLowerCase();
        if (state === 'in_progress' || state === 'completed') {
          clearInterval(interval);
          pollIntervalsRef.current.delete(interval);
          setGeneratingIds(prev => {
            const next = new Set(prev);
            next.delete(chapterId);
            return next;
          });
          if (onChaptersChanged) onChaptersChanged();
        }
      } catch {
        // keep polling
      }
    }, 3000);
    pollIntervalsRef.current.add(interval);
  };

  const toggleExpand = (id) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="co-container">
      <div className="co-header">
        <Sparkles size={20} className="co-header-icon" />
        <div>
          <h2 className="co-header-title">Course Modules</h2>
          <p className="co-header-sub">
            {chapters.filter(c => getState(c) === CHAPTER_STATE.COMPLETED).length} / {chapters.length} modules completed
          </p>
        </div>
      </div>

      <div className="co-modules">
        {chapters
          .sort((a, b) => a.order_index - b.order_index)
          .map((ch) => {
            const state = getState(ch);
            const isLocked = state === CHAPTER_STATE.LOCKED;
            const isGenerating = state === CHAPTER_STATE.GENERATING || generatingIds.has(ch.id);
            const isReady = state === CHAPTER_STATE.IN_PROGRESS;
            const isCompleted = state === CHAPTER_STATE.COMPLETED;
            const canGenerate = ch.id === nextGeneratableId && !isGenerating;
            const isExpanded = expandedId === ch.id;
            const sections = allSectionsMap[ch.id] || [];
            const IconComponent = getChapterIcon(ch.title);
            const num = ch.order_index < 10 ? `0${ch.order_index}` : ch.order_index;

            return (
              <div
                key={ch.id}
                className={`co-module ${isLocked ? 'locked' : ''} ${isCompleted ? 'completed' : ''} ${isReady ? 'ready' : ''}`}
              >
                {/* Module Header */}
                <div className="co-module-header">
                  <div className="co-module-meta">
                    <span className="co-module-label">MODULE {num}</span>
                  </div>

                  <div className="co-module-title-row">
                    <div className="co-module-icon-wrap">
                      <IconComponent size={22} />
                    </div>
                    <h3
                      className="co-module-title"
                      onClick={() => !isLocked && onNavigateToChapter(ch.id)}
                      style={{ cursor: isLocked ? 'default' : 'pointer' }}
                    >
                      {ch.title}
                    </h3>

                    {/* Status badge / Generate button */}
                    <div className="co-module-actions">
                      {isCompleted && (
                        <span className="co-badge co-badge-completed">
                          <CheckCircle size={14} /> COMPLETED
                        </span>
                      )}
                      {isReady && (
                        <span
                          className="co-badge co-badge-ready"
                          onClick={() => onNavigateToChapter(ch.id)}
                          style={{ cursor: 'pointer' }}
                        >
                          <CheckCircle size={14} /> READY TO LEARN
                        </span>
                      )}
                      {isGenerating && (
                        <span className="co-badge co-badge-generating">
                          <Loader2 size={14} className="animate-spin" /> GENERATING...
                        </span>
                      )}
                      {(state === CHAPTER_STATE.PENDING || state === CHAPTER_STATE.LOCKED) && !isGenerating && (
                        <button
                          className="co-generate-btn"
                          onClick={() => handleGenerate(ch.id)}
                          title="Pre-generate this module"
                        >
                          <Play size={14} /> Generate module
                        </button>
                      )}
                      {isLocked && !isGenerating && state !== CHAPTER_STATE.PENDING && (
                        <Lock size={14} className="co-lock-icon-simple" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Sub-chapter list */}
                {!isLocked && sections.length > 0 && (
                  <div className="co-sections-wrap">
                    <div className={`co-sections ${isExpanded ? 'expanded' : ''}`}>
                      {(isExpanded ? sections : sections.slice(0, 3)).map((sec, idx) => (
                        <div
                          key={sec.id}
                          className={`co-section-item ${sec.is_completed ? 'done' : ''}`}
                          onClick={() => onNavigateToChapter(ch.id, idx)}
                        >
                          <div className="co-section-num">{idx + 1}</div>
                          <span className="co-section-name">{sec.title}</span>
                          {sec.is_completed && <CheckCircle size={14} className="co-section-check" />}
                        </div>
                      ))}
                    </div>
                    {sections.length > 3 && (
                      <button
                        className="co-show-more"
                        onClick={() => toggleExpand(ch.id)}
                      >
                        {isExpanded ? (
                          <><ChevronUp size={14} /> Show Less</>
                        ) : (
                          <><ChevronDown size={14} /> Show More ({sections.length - 3} more)</>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Description for locked */}
                {isLocked && ch.description && (
                  <p className="co-module-desc">{ch.description}</p>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};

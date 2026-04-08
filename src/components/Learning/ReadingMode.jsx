import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Loader2, Sparkles, CheckCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiService } from '../../services/api';
import { InlineQuiz } from './InlineQuiz';
import './ReadingMode.css';
import './InlineQuiz.css';

export const ReadingMode = ({ chapterId, chapterTitle, forceViewIndex, onSwitchToChat, onSectionsLoaded }) => {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const pollRef = useRef(null);

  const [pollCount, setPollCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);

  const fetchSections = useCallback(async () => {
    if (!chapterId) return;
    try {
      const response = await apiService.getChapterDocument(chapterId);

      // 202 comes back as response.status === 'generating'
      if (response?.status === 'generating') {
        setGenerating(true);
        setLoading(false);
        setError(null);
        return false; // Not ready yet
      }

      // 200 — sections array
      setSections(response);
      setGenerating(false);
      setLoading(false);
      setError(null);
      if (onSectionsLoaded) onSectionsLoaded(response);
      return true; // Done
    } catch (err) {
      console.error('Failed to load document:', err);
      const status = err.response?.status;
      
      if (status === 429) {
        setError(err.response?.data?.message || 'Please wait a moment before retrying.');
      } else if (status === 500) {
        setError('AI generation failed. Please try again.');
      } else {
        setError('Failed to load chapter content.');
      }
      
      setGenerating(false);
      setLoading(false);
      return true; // Stop polling on error
    }
  }, [chapterId, onSectionsLoaded]);

  useEffect(() => {
    let active = true;
    let retries = 0;
    const MAX_RETRIES = 40; 

    const startPolling = async () => {
      const ready = await fetchSections();
      if (ready || !active) return;

      pollRef.current = setInterval(async () => {
        retries++;
        setPollCount(retries);
        
        if (retries >= MAX_RETRIES) {
          setError('Generation is taking longer than expected.');
          setGenerating(false);
          setLoading(false);
          clearInterval(pollRef.current);
          return;
        }

        const done = await fetchSections();
        if (done || !active) {
          clearInterval(pollRef.current);
        }
      }, 3000);
    };

    if (generating) {
      startPolling();
    } else if (loading && !error) {
      startPolling();
    }

    return () => {
      active = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [chapterId, fetchSections, generating, loading, error]);

  const firstIncompleteIdx = sections.findIndex(s => !s.is_completed);
  const activeSectionIndex = firstIncompleteIdx === -1 ? sections.length : firstIncompleteIdx;
  
  const [viewIndex, setViewIndex] = useState(0);

  // Automatically advance to the newly unlocked section when progressing
  useEffect(() => {
    setViewIndex(activeSectionIndex);
  }, [activeSectionIndex]);

  // Respond to sidebar clicks
  useEffect(() => {
    if (typeof forceViewIndex === 'number') {
      if (forceViewIndex <= activeSectionIndex && forceViewIndex >= 0) {
        setViewIndex(forceViewIndex);
      }
    }
  }, [forceViewIndex, activeSectionIndex]);

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await apiService.retryChapterGeneration(chapterId);
      setError(null);
      setLoading(true);
      setPollCount(0);
      // fetchSections will be re-triggered by the useEffect because loading is true
    } catch (err) {
      setError('Failed to reset chapter. Please refresh.');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSectionPass = (sectionId) => {
    setSections(prev =>
      prev.map(s => s.id === sectionId ? { ...s, is_completed: true } : s)
    );
    if (onSectionsLoaded) {
      // Notify parent to refresh navigation checkmarks
      onSectionsLoaded(sections.map(s => s.id === sectionId ? { ...s, is_completed: true } : s));
    }
  };

  if (loading) {
    return (
      <div className="rm-loading">
        <Loader2 size={32} className="animate-spin" />
        <p>Loading chapter content...</p>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="rm-generating">
        <div className="rm-generating-card glass">
          <Loader2 size={40} className="animate-spin rm-gen-spinner" />
          <h3>Generating Content</h3>
          <p>Your chapter is being prepared by the AI.</p>
          <p className="rm-poll-hint">Working... (Attempt {pollCount}/40)</p>
          <div className="rm-gen-dots">
            <span className="rm-dot" />
            <span className="rm-dot" />
            <span className="rm-dot" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rm-generating">
        <div className="rm-error-card glass">
          <div className="rm-error-icon">⚠️</div>
          <h3>Generation Problem</h3>
          <p>{error}</p>
          <button 
            className="rm-retry-btn" 
            onClick={handleRetry}
            disabled={isRetrying}
          >
            {isRetrying ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            Try Again
          </button>
        </div>
      </div>
    );
  }

  const handleNext = () => {
    if (viewIndex < activeSectionIndex) {
      setViewIndex(prev => prev + 1);
    }
  };

  const handlePrev = () => {
    if (viewIndex > 0) {
      setViewIndex(prev => prev - 1);
    }
  };

  const isCurrentActive = viewIndex === activeSectionIndex;
  const isFinished = viewIndex === sections.length;

  return (
    <div className="rm-container">
      <div className="rm-scroll-area">
        <div className="rm-content">
          <div className="rm-meta-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <span className="rm-badge rm-badge-active">Curriculum Navigator</span>
              <span className="rm-meta-info" style={{ marginLeft: 'auto' }}>
                {isFinished ? 'Completed' : `Sub-chapter ${viewIndex + 1} of ${sections.length}`}
              </span>
            </div>
            
            {!isFinished && sections.length > 0 && (
              <div className="rm-pagination" style={{ display: 'flex', gap: '8px' }}>
                <button 
                  onClick={handlePrev} 
                  disabled={viewIndex === 0}
                  style={{ padding: '4px 12px', borderRadius: '6px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', color: viewIndex === 0 ? 'var(--text-muted)' : 'var(--text-primary)', cursor: viewIndex === 0 ? 'not-allowed' : 'pointer' }}
                >
                  Previous
                </button>
                <button 
                  onClick={handleNext} 
                  disabled={viewIndex >= activeSectionIndex || viewIndex >= sections.length - 1}
                  style={{ padding: '4px 12px', borderRadius: '6px', background: 'var(--surface-color)', border: '1px solid var(--border-color)', color: (viewIndex >= activeSectionIndex || viewIndex >= sections.length - 1) ? 'var(--text-muted)' : 'var(--text-primary)', cursor: (viewIndex >= activeSectionIndex || viewIndex >= sections.length - 1) ? 'not-allowed' : 'pointer' }}
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {isFinished ? (
            <div className="rm-completion-card glass" style={{ marginTop: '2rem' }}>
              <div className="rm-cta-icon">🏆</div>
              <h3>Chapter Document Fully Mastered!</h3>
              <p>You've successfully passed all knowledge checks. You can now move to the next chapter from the sidebar.</p>
              <button className="rm-cta-btn" onClick={onSwitchToChat}>
                Discuss with Teacher
              </button>
              
              <div style={{ marginTop: '2rem', textAlign: 'center' }}>
                 <button 
                   onClick={() => setViewIndex(sections.length - 1)}
                   style={{ background: 'transparent', border: 'none', color: 'var(--primary-color)', cursor: 'pointer', textDecoration: 'underline' }}
                 >
                   Review Previous Sections
                 </button>
              </div>
            </div>
          ) : (
            <div className={`rm-section ${sections[viewIndex].is_completed ? 'rm-section-done' : ''}`} style={{ marginTop: '1rem' }}>
              <div className="rm-section-header">
                <div className="rm-section-indicator">
                  {sections[viewIndex].is_completed ? (
                    <CheckCircle size={18} className="rm-check-icon" />
                  ) : (
                    <div className="rm-section-num">{viewIndex + 1}</div>
                  )}
                </div>
                <h2 className="rm-section-title">{sections[viewIndex].title}</h2>
              </div>

              <div className="rm-markdown-wrapper">
                <div className="rm-markdown-content">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {sections[viewIndex].content}
                  </ReactMarkdown>
                </div>
              </div>

              {isCurrentActive && !sections[viewIndex].is_completed && (
                <InlineQuiz 
                  sectionId={sections[viewIndex].id} 
                  onPass={() => handleSectionPass(sections[viewIndex].id)} 
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

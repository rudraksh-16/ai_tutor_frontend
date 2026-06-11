import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Loader2, Sparkles, PanelRightOpen } from 'lucide-react';
import { Toast } from '../Toast';
import { v4 as uuidv4 } from 'uuid';
import { Message } from '../Chat/Message';
import { CurriculumCanvas, extractCurriculumFromMessages, parseCurriculum } from './CurriculumCanvas';
import { streamCurriculumChat, apiService } from '../../services/api';
import { PlanningOverlay } from './PlanningOverlay';
import '../Chat/Chat.css';

export const CurriculumChat = ({
  topicId: propTopicId,
  topicTitle: propTopicTitle,
  onRefreshSidebar
}) => {
  const { topicId: urlTopicId } = useParams();
  const topicId = propTopicId || urlTopicId;

  const [messages, setMessages] = useState([]);
  const [topicTitle, setTopicTitle] = useState(propTopicTitle || '');
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [curriculumSaved, setCurriculumSaved] = useState(false);
  const [toast, setToast] = useState(null);
  const [showCanvas, setShowCanvas] = useState(true);
  const [showFinalizeConfirm, setShowFinalizeConfirm] = useState(false);
  const [canvasWidth, setCanvasWidth] = useState(420);
  const isDragging = useRef(false);
  const chatListRef = useRef(null);
  const messagesEndRef = useRef(null);
  const initializationRef = useRef(null);
  const textareaRef = useRef(null);
  const isStreamingRef = useRef(false);

  // Extract the latest curriculum content from messages (works during streaming too)
  const curriculumContent = useMemo(() => {
    return extractCurriculumFromMessages(messages);
  }, [messages]);

  // Auto-show canvas when curriculum is first generated
  useEffect(() => {
    if (curriculumContent) setShowCanvas(true);
  }, [curriculumContent]);

  // Reset state and initialize on topicId change
  useEffect(() => {
    if (!topicId) return;
    if (initializationRef.current === topicId) return;
    initializationRef.current = topicId;

    setMessages([]);
    setTopicTitle(propTopicTitle || '');
    setIsInitializing(true);
    setIsStreaming(false);
    setIsPlanning(false);
    setCurriculumSaved(false);

    const controller = new AbortController();

    const initialize = async () => {
      try {
        let currentTopicTitle = propTopicTitle;
        let currentTopicSummary = '';
        if (!currentTopicTitle) {
          const data = await apiService.getTopic(topicId, controller.signal);
          currentTopicTitle = data.title;
          currentTopicSummary = data.user_summary;
          setTopicTitle(data.title);
        }

        const status = await apiService.getPlanningStatus(topicId, controller.signal);
        const planningActive =
          status.topic_status === 'in_progress'
          || status.topic_status === 'completed';
        if (planningActive) {
          setIsPlanning(true);
          setCurriculumSaved(true);
        }

        const history = await apiService.getCurriculumMessages(topicId, controller.signal);
        if (history && history.length > 0) {
          const filtered = history.filter(m => m.role === 'assistant' || m.role === 'user');
          const hydratedHistory = filtered.map(m => ({
            ...m,
            id: m.id || uuidv4(),
            timestamp: m.created_at || new Date().toISOString()
          }));
          setMessages(hydratedHistory);
          if (!planningActive && hydratedHistory[hydratedHistory.length - 1]?.role === 'user') {
            resumeConversation();
          }
        } else {
          // If brand new chat, display the topic summary as the initial user message so it's consistent with reloads
          if (currentTopicSummary) {
             setMessages([{
               id: uuidv4(),
               role: 'user',
               content: currentTopicSummary,
               timestamp: new Date().toISOString(),
             }]);
          }
          sendToAgent(null);
        }

        setIsInitializing(false);
      } catch (err) {
        if (err.code === 'ERR_CANCELED') return;
        console.error('Failed to initialize:', err);
        setIsInitializing(false);
      }
    };

    initialize();
    return () => {
      controller.abort();
      initializationRef.current = null;
    };
  }, [propTopicTitle, topicId]);

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback((force = false) => {
    if (!chatListRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = chatListRef.current;
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 150;

    if (force || isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // Re-focus textarea after streaming ends
  useEffect(() => {
    if (!isStreaming && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isStreaming]);

  // ── Resizer logic ──
  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    const newWidth = window.innerWidth - e.clientX;
    const maxWidth = Math.min(800, window.innerWidth - 500);
    if (newWidth > 320 && newWidth < maxWidth) {
      setCanvasWidth(newWidth);
    }
  }, []);

  const stopResize = useCallback(() => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', stopResize);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = '';
  }, [handleMouseMove]);

  const startResize = useCallback(() => {
    isDragging.current = true;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [handleMouseMove, stopResize]);

  const appendAssistantChunk = useCallback((assistantMessageId, chunk) => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === assistantMessageId
          ? { ...message, content: `${message.content}${chunk}` }
          : message
      )
    );
  }, []);

  const appendResumedAssistantChunk = useCallback((assistantMessageId, chunk) => {
    setMessages((prev) => {
      const hasAssistant = prev.some((message) => message.id === assistantMessageId);
      if (!hasAssistant) {
        return [
          ...prev,
          {
            id: assistantMessageId,
            role: 'assistant',
            content: chunk,
            timestamp: new Date().toISOString(),
          },
        ];
      }

      return prev.map((message) =>
        message.id === assistantMessageId
          ? { ...message, content: `${message.content}${chunk}` }
          : message
      );
    });
  }, []);

  const replaceResumedAssistantContent = useCallback((assistantMessageId, content) => {
    setMessages((prev) => {
      const hasAssistant = prev.some((message) => message.id === assistantMessageId);
      if (!hasAssistant) {
        return [
          ...prev,
          {
            id: assistantMessageId,
            role: 'assistant',
            content,
            timestamp: new Date().toISOString(),
          },
        ];
      }

      return prev.map((message) =>
        message.id === assistantMessageId
          ? { ...message, content }
          : message
      );
    });
  }, []);

  // ── Agent communication ──
  const sendToAgent = useCallback((userMessage) => {
    setIsStreaming(true);
    const assistantMessageId = uuidv4();

    if (userMessage) {
      setMessages(prev => [...prev, {
        id: uuidv4(),
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
      }]);
    }

    setMessages(prev => [...prev, {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }]);

    streamCurriculumChat(
      { topic_id: topicId, user_message: userMessage },
      (chunk) => appendAssistantChunk(assistantMessageId, chunk),
      () => {
        setIsStreaming(false);
        setIsInitializing(false);
      },
      (error) => {
        const msg = typeof error === 'string' ? error : 'Connection error. Please try again.';
        setIsStreaming(false);
        setIsInitializing(false);
        setToast(msg);
        setMessages(prev => prev.map(m =>
          m.id === assistantMessageId ? { ...m, content: msg, isError: true } : m
        ));
      },
      () => {
        // planning_started event from SSE — agent used upsert_curriculum
        setIsStreaming(false);
        setCurriculumSaved(true);
        setIsPlanning(true);
        if (onRefreshSidebar) onRefreshSidebar();
      }
    );
  }, [appendAssistantChunk, onRefreshSidebar, topicId]);

  const resumeConversation = useCallback(() => {
    if (!topicId || isPlanning || isStreamingRef.current) {
      return;
    }

    const assistantMessageId = uuidv4();
    setIsStreaming(true);

    streamCurriculumChat(
      { topic_id: topicId, resume_stream: true },
      (chunk) => appendResumedAssistantChunk(assistantMessageId, chunk),
      () => {
        setIsStreaming(false);
        setIsInitializing(false);
      },
      (error) => {
        const msg = typeof error === 'string' ? error : 'Connection error. Please try again.';
        setIsStreaming(false);
        setIsInitializing(false);
        setToast(msg);
        setMessages(prev => {
          const exists = prev.some(m => m.id === assistantMessageId);
          if (exists) return prev.map(m => m.id === assistantMessageId ? { ...m, content: msg, isError: true } : m);
          return [...prev, { id: assistantMessageId, role: 'assistant', content: msg, isError: true, timestamp: new Date().toISOString() }];
        });
      },
      () => {
        setIsStreaming(false);
        setCurriculumSaved(true);
        setIsPlanning(true);
        if (onRefreshSidebar) onRefreshSidebar();
      },
      (eventData) => replaceResumedAssistantContent(assistantMessageId, eventData.content || '')
    );
  }, [
    appendResumedAssistantChunk,
    isPlanning,
    onRefreshSidebar,
    replaceResumedAssistantContent,
    topicId,
  ]);

  const handleSend = () => {
    if (!input.trim() || isStreaming || isPlanning || !topicId) return;
    const currentInput = input;
    setInput('');
    setToast(null);
    sendToAgent(currentInput);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFinalize = async () => {
    if (!topicId || isStreaming || !curriculumContent) return;
    setShowFinalizeConfirm(true);
  };

  const confirmFinalize = async () => {
    if (!topicId || isStreaming || !curriculumContent) return;

    const parsed = parseCurriculum(curriculumContent);
    setShowFinalizeConfirm(false);
    setIsPlanning(true);
    setCurriculumSaved(true);

    try {
      await apiService.triggerPlanner(topicId, parsed);
      if (onRefreshSidebar) onRefreshSidebar();
    } catch (err) {
      console.error('Failed to trigger planner:', err);
      setIsPlanning(false);
      setCurriculumSaved(false);
      setToast('AI Tutor could not finalize this curriculum. Please try again.');
    }
  };

  // The "Accept" button should appear when the canvas has a curriculum AND the agent isn't streaming
  const showAcceptButton = !!curriculumContent && !isPlanning && !curriculumSaved && !isStreaming;
  const hasCanvas = !!curriculumContent;

  return (
    <>
    <div className="curriculum-layout">
      {/* ── Left: Chat or Overlay ── */}
      <div className="chat-container">
        {isPlanning ? (
          <>
            {hasCanvas && !showCanvas && (
              <button
                className="canvas-toggle-btn"
                style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
                onClick={() => setShowCanvas(true)}
                title="Show curriculum"
              >
                <PanelRightOpen size={18} />
              </button>
            )}
            <PlanningOverlay topicId={topicId} />
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="chat-header chat-header-split">
              <h2>
                <span>Curriculum Negotiation:</span>
                <span className="chapter-badge">{topicTitle || 'Loading...'}</span>
              </h2>

              <div className="chat-header-actions">
                {hasCanvas && !showCanvas && (
                  <button
                    className="canvas-toggle-btn"
                    onClick={() => setShowCanvas(true)}
                    title="Show curriculum"
                  >
                    <PanelRightOpen size={18} />
                  </button>
                )}

                {showAcceptButton && (
                  <button
                    className="new-topic-btn"
                    style={{ width: 'auto', padding: '6px 16px', fontSize: '0.85rem' }}
                    onClick={handleFinalize}
                    disabled={isStreaming}
                  >
                    <Sparkles size={16} />
                    Accept & Finalize Curriculum
                  </button>
                )}
              </div>
            </div>

            <div className="messages-list" ref={chatListRef}>
              <div className="messages-inner">
                {messages.map((msg, index) => (
                  <Message
                    key={msg.id}
                    message={msg}
                    isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
                    hideCurriculum={true}
                  />
                ))}
                {isInitializing && messages.length === 0 && (
                  <div className="init-loading">
                    <Loader2 size={32} className="animate-spin" />
                    <p>Initializing curriculum agent...</p>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="chat-input-container">
              <div className="input-wrapper">
                <textarea
                  ref={textareaRef}
                  className="chat-textarea"
                  placeholder={isPlanning ? 'Planning in progress...' : 'Discuss your curriculum preferences...'}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isPlanning}
                />
                <button
                  className="send-btn"
                  onClick={handleSend}
                  disabled={!input.trim() || isStreaming || isPlanning}
                >
                  {isStreaming ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Resizer ── */}
      {hasCanvas && showCanvas && (
        <div
          className="resizer-handle"
          onMouseDown={startResize}
        />
      )}

      {/* ── Right: Canvas Panel ── */}
      {hasCanvas && showCanvas && (
        <div className="canvas-wrapper" style={{ width: `${canvasWidth}px`, minWidth: `${canvasWidth}px`, flexShrink: 0 }}>
          <CurriculumCanvas
            content={curriculumContent}
            onClose={() => setShowCanvas(false)}
          />
        </div>
      )}
    </div>
    {showFinalizeConfirm && (
      <div
        className="ai-confirm-backdrop"
        role="presentation"
        onClick={() => setShowFinalizeConfirm(false)}
      >
        <div
          className="ai-confirm-dialog glass"
          role="dialog"
          aria-modal="true"
          aria-labelledby="finalize-curriculum-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ai-confirm-icon">
            <Sparkles size={20} />
          </div>
          <div className="ai-confirm-content">
            <h2 id="finalize-curriculum-title">AI Tutor</h2>
            <p>Finalize this curriculum and generate lesson plans?</p>
          </div>
          <div className="ai-confirm-actions">
            <button
              type="button"
              className="ai-confirm-btn ai-confirm-cancel"
              onClick={() => setShowFinalizeConfirm(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ai-confirm-btn ai-confirm-primary"
              onClick={confirmFinalize}
            >
              Finalize
            </button>
          </div>
        </div>
      </div>
    )}
    <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
};

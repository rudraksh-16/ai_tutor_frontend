import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Loader2, Sparkles, PanelRightOpen } from 'lucide-react';
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
  const [showCanvas, setShowCanvas] = useState(true);
  const [canvasWidth, setCanvasWidth] = useState(420);
  const isDragging = useRef(false);
  const messagesEndRef = useRef(null);
  const initializationRef = useRef(null);
  const textareaRef = useRef(null);

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

    const initialize = async () => {
      try {
        let currentTopicTitle = propTopicTitle;
        let currentTopicSummary = '';
        if (!currentTopicTitle) {
          const data = await apiService.getTopic(topicId);
          currentTopicTitle = data.title;
          currentTopicSummary = data.user_summary;
          setTopicTitle(data.title);
        }

        // Check planning status FIRST — if already planning/done, show overlay immediately
        const status = await apiService.getPlanningStatus(topicId);
        if (status.topic_status === 'in_progress' || status.topic_status === 'completed') {
          setIsPlanning(true);
          setCurriculumSaved(true);
        }

        const history = await apiService.getCurriculumMessages(topicId);
        if (history && history.length > 0) {
          const filtered = history.filter(m => m.role === 'assistant' || m.role === 'user');
          setMessages(filtered.map(m => ({
            ...m,
            id: m.id || uuidv4(),
            timestamp: m.created_at || new Date().toISOString()
          })));
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
        console.error('Failed to initialize:', err);
        setIsInitializing(false);
      }
    };

    initialize();
  }, [topicId]);

  // Scroll to bottom on new messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isStreaming, scrollToBottom]);

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

  // ── Agent communication ──
  const sendToAgent = (userMessage) => {
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
      (chunk) => {
        setMessages(prev =>
          prev.map(m =>
            m.id === assistantMessageId ? { ...m, content: m.content + chunk } : m
          )
        );
      },
      () => {
        setIsStreaming(false);
        setIsInitializing(false);
        if (onRefreshSidebar) onRefreshSidebar();
      },
      (error) => {
        setIsStreaming(false);
        setIsInitializing(false);
        console.error('Stream error:', error);
      },
      () => {
        // planning_started event from SSE — agent used upsert_curriculum
        setIsStreaming(false);
        setCurriculumSaved(true);
        setIsPlanning(true);
        if (onRefreshSidebar) onRefreshSidebar();
      }
    );
  };

  const handleSend = () => {
    if (!input.trim() || isStreaming || isPlanning || !topicId) return;
    const currentInput = input;
    setInput('');
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
    if (window.confirm('Finalize this curriculum and generate lesson plans?')) {
      const parsed = parseCurriculum(curriculumContent);
      setIsPlanning(true);
      setCurriculumSaved(true);
      if (onRefreshSidebar) onRefreshSidebar();
      
      try {
        await apiService.triggerPlanner(topicId, parsed);
      } catch (err) {
        console.error('Failed to trigger planner:', err);
        setIsPlanning(false);
        setCurriculumSaved(false);
      }
    }
  };

  // The "Accept" button should appear when the canvas has a curriculum AND the agent isn't streaming
  const showAcceptButton = !!curriculumContent && !isPlanning && !curriculumSaved && !isStreaming;
  const hasCanvas = !!curriculumContent;

  return (
    <div className="curriculum-layout">
      {/* ── Left: Chat or Overlay ── */}
      <div className="chat-container">
        {isPlanning ? (
          <PlanningOverlay topicId={topicId} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="chat-header" style={{ justifyContent: 'space-between' }}>
              <h2>
                <span>Curriculum Negotiation:</span>
                <span className="chapter-badge">{topicTitle || 'Loading...'}</span>
              </h2>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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

            <div className="messages-list">
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
  );
};

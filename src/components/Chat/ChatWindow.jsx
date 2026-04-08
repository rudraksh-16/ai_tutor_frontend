import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Send, Loader2, AlertCircle, Trophy, ArrowRight } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { Message } from './Message';
import { streamTeacherChat, apiService } from '../../services/api';
import './Chat.css';

export const ChatWindow = ({ 
  chapterId: propChapterId, 
  chapterTitle: propChapterTitle,
  onChapterCompleted
}) => {
  const { chapterId: urlChapterId } = useParams();
  const navigate = useNavigate();
  const chapterId = propChapterId || urlChapterId;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [chapterTitle, setChapterTitle] = useState(propChapterTitle || 'Loading...');
  const [error, setError] = useState(null);
  const [chapterCompleted, setChapterCompleted] = useState(false);
  
  const chatListRef = useRef(null);
  const messagesEndRef = useRef(null);
  const greetingTriggeredRef = useRef(null);
  const isStreamingRef = useRef(false);

  // Scroll — Only if user is near bottom (Sticky Scroll)
  const scrollToBottom = useCallback((force = false) => {
    if (!chatListRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = chatListRef.current;
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 150;

    if (force || isAtBottom) {
       messagesEndRef.current?.scrollIntoView({
        behavior: isStreamingRef.current ? 'auto' : 'smooth',
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Sync ref with state
  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (chapterId) {
       apiService.getChapter(chapterId).then(data => {
         setChapterTitle(data.title);
         if (data.status === 'completed') {
           setChapterCompleted(true);
         }
       }).catch(err => console.error("Failed to load chapter title:", err));
    }
  }, [chapterId]);

  useEffect(() => {
    let active = true;

    const loadHistory = async () => {
      if (!chapterId) return;
      try {
        const history = await apiService.getChapterMessages(chapterId, 'teacher');
        if (!active) return;

        if (history && history.length > 0) {
          const filteredHistory = history.filter(m => m.role === 'assistant' || m.role === 'user');
          setMessages(filteredHistory.map(m => ({
            ...m,
            id: m.id || uuidv4(),
            timestamp: m.created_at || new Date().toISOString()
          })));
        } else {
          // Prevent overwriting if the greeting was already initiated by another effect/render
          if (greetingTriggeredRef.current !== chapterId && !isStreamingRef.current) {
            setMessages([]);
            
            setTimeout(() => {
              if (greetingTriggeredRef.current !== chapterId) {
                greetingTriggeredRef.current = chapterId;
                triggerAutoGreeting();
              }
            }, 0);
          }
        }
      } catch (err) {
        if (!active) return;
        console.error("Failed to load history:", err);
        setError("Failed to load chat history. Please refresh the page.");
      }
    };
    
    loadHistory();

    return () => {
      active = false;
    };
  }, [chapterId]);

  const triggerAutoGreeting = async () => {
    if (isStreaming || !chapterId) return;

    const greetingText = "Ready to start learning this chapter!";
    const userMessageId = uuidv4();
    const assistantMessageId = uuidv4();

    setIsStreaming(true);
    setError(null);

    setMessages([
      {
        id: userMessageId,
        role: 'user',
        content: greetingText,
        timestamp: new Date().toISOString(),
      },
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      }
    ]);

    streamTeacherChat(
      { chapter_id: chapterId, user_message: greetingText },
      (chunk) => {
        setMessages((prev) => {
          // If for some reason the initial greeting messages got lost from 'prev', re-inject them
          const hasAssistant = prev.some(m => m.id === assistantMessageId);
          if (!hasAssistant) {
             return [
               ...prev,
               { id: userMessageId, role: 'user', content: greetingText, timestamp: new Date().toISOString() },
               { id: assistantMessageId, role: 'assistant', content: chunk, timestamp: new Date().toISOString() }
             ];
          }
          return prev.map((m) =>
            m.id === assistantMessageId ? { ...m, content: m.content + chunk } : m
          );
        });
      },
      () => {
        setIsStreaming(false);
        setMessages((prev) => {
          const assistantMsg = prev.find(m => m.id === assistantMessageId);
          if (assistantMsg && !assistantMsg.content.trim()) {
            setError("The AI couldn't generate a response. Please try sending a message.");
            return prev.filter(m => m.id !== assistantMessageId);
          }
          return prev;
        });
      },
      (err) => {
        setIsStreaming(false);
        setError(`Failed to get response: ${typeof err === 'string' ? err : 'Connection error. Please try again.'}`);
        setMessages((prev) => prev.filter(m => m.id !== assistantMessageId));
      }
    );
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !chapterId) return;

    setError(null);

    const userMessage = {
      id: uuidv4(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    const currentInput = input;
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsStreaming(true);

    const assistantMessageId = uuidv4();
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      },
    ]);

    streamTeacherChat(
      { chapter_id: chapterId, user_message: currentInput },
      (chunk) => {
        setMessages((prev) => {
          const hasAssistant = prev.some(m => m.id === assistantMessageId);
          if (!hasAssistant) {
             return [
               ...prev,
               { id: userMessage.id, role: 'user', content: currentInput, timestamp: new Date().toISOString() },
               { id: assistantMessageId, role: 'assistant', content: chunk, timestamp: new Date().toISOString() }
             ];
          }
          return prev.map((m) =>
            m.id === assistantMessageId ? { ...m, content: m.content + chunk } : m
          );
        });
      },
      () => {
        setIsStreaming(false);
        setMessages((prev) => {
          const assistantMsg = prev.find(m => m.id === assistantMessageId);
          if (assistantMsg && !assistantMsg.content.trim()) {
            setError("The AI processed your request but couldn't generate a visible response. Please try asking again.");
            return prev.filter(m => m.id !== assistantMessageId);
          }
          return prev;
        });
      },
      (err) => {
        setIsStreaming(false);
        setError(`Something went wrong: ${typeof err === 'string' ? err : 'Connection error. Please try again.'}`);
        setMessages((prev) => prev.filter(m => m.id !== assistantMessageId));
      },
      // quiz_ready event handler
      async (eventData) => {
        if (eventData.type === 'quiz_ready') {
          // The teacher agent has marked this chapter's outline as quiz_pending
          // Quiz will be delivered inline via the teacher's create_quiz tool
        } else if (eventData.type === 'chapter_completed') {
          setChapterCompleted(true);
          if (onChapterCompleted) {
            onChapterCompleted();
          }
        }
      }
    );
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Called by QuizCard when backend confirms quiz result
  const handleQuizComplete = async (score, total) => {
    // Backend already handles chapter completion and next-chapter unlock
    setChapterCompleted(true);
    if (onChapterCompleted) {
      onChapterCompleted();
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-header" style={{ justifyContent: 'space-between' }}>
        <h2>
          <span className="chapter-badge">{chapterTitle}</span>
        </h2>
      </div>

      <div className="messages-list" ref={chatListRef}>
        {error && (
          <div className="chat-error-banner">
            <AlertCircle size={16} />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="chat-error-dismiss">×</button>
          </div>
        )}

        {messages.length === 0 && !error ? (
          <div style={{ margin: 'auto', color: 'hsl(var(--text-muted))', textAlign: 'center' }}>
            <p>Start chatting with your Teacher to learn this chapter!</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <Message
              key={msg.id}
              message={msg}
              chapterId={chapterId}
              isStreaming={isStreaming && index === messages.length - 1 && msg.role === 'assistant'}
              onQuizComplete={handleQuizComplete}
            />
          ))
        )}

        {chapterCompleted && (
          <div className="chapter-complete-banner">
            <Trophy size={28} className="chapter-complete-icon" />
            <div>
              <h3>Chapter Completed! 🎉</h3>
              <p>Great work! The next chapter has been unlocked.</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-container">
        <div className="input-wrapper">
          <textarea
            className="chat-textarea"
            placeholder={chapterCompleted ? "Chapter complete! You can still ask questions..." : "Ask a question..."}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            {isStreaming ? <Loader2 className="animate-spin" size={20} /> : <Send size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
};

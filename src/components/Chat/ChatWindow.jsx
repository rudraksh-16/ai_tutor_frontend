import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Send, Trophy } from 'lucide-react';
import { Toast } from '../Toast';
import { v4 as uuidv4 } from 'uuid';
import { Message } from './Message';
import { apiService, streamTeacherChat } from '../../services/api';
import './Chat.css';

export const ChatWindow = ({
  chapterId: propChapterId,
  onChapterCompleted,
}) => {
  const { chapterId: urlChapterId } = useParams();
  const chapterId = propChapterId || urlChapterId;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [chapterCompleted, setChapterCompleted] = useState(false);
  const [toast, setToast] = useState(null);

  const chatListRef = useRef(null);
  const messagesEndRef = useRef(null);
  const autoStartRef = useRef(null);
  const isStreamingRef = useRef(false);
  const resumeConversationRef = useRef(null);

  const scrollToBottom = useCallback((force = false) => {
    if (!chatListRef.current) return;

    const { scrollTop, scrollHeight, clientHeight } = chatListRef.current;
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 150;

    if (force || isAtBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, []);

  const scrollToLatestMessage = useCallback(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        scrollToBottom(true);
      });
    });
  }, [scrollToBottom]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!chapterCompleted) return;
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  }, [chapterCompleted]);

  useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  useEffect(() => {
    if (!chapterId) return;

    const controller = new AbortController();

    const loadChapter = async () => {
      try {
        const data = await apiService.getChapter(chapterId, controller.signal);
        setChapterCompleted((data.status || '').toLowerCase() === 'completed');
      } catch (err) {
        if (err.code === 'ERR_CANCELED') return;
        console.error('Failed to load chapter title:', err);
      }
    };

    loadChapter();

    return () => controller.abort();
  }, [chapterId]);

  const attachAssistantChunk = useCallback((assistantMessageId, fallbackUserMessage, chunk) => {
    setMessages((prev) => {
      const hasAssistant = prev.some((message) => message.id === assistantMessageId);
      if (!hasAssistant) {
        return [
          ...prev,
          {
            id: uuidv4(),
            role: 'user',
            content: fallbackUserMessage,
            timestamp: new Date().toISOString(),
          },
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

  const finalizeAssistantMessage = useCallback((assistantMessageId, emptyMessage) => {
    setMessages((prev) => {
      const assistantMessage = prev.find((message) => message.id === assistantMessageId);
      if (assistantMessage && !assistantMessage.content.trim()) {
        setError(emptyMessage);
        return prev.filter((message) => message.id !== assistantMessageId);
      }
      return prev;
    });
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

  const emitStream = useCallback((messageText, assistantMessageId) => {
    const request = {
      chapter_id: chapterId,
      user_message: messageText,
    };

    const handleChunk = (chunk) => {
      attachAssistantChunk(assistantMessageId, messageText, chunk);
    };

    const handleDone = () => {
      setIsStreaming(false);
      finalizeAssistantMessage(
        assistantMessageId,
        "The AI couldn't generate a response. Please try again."
      );
    };

    const handleError = (streamError) => {
      const msg = typeof streamError === 'string' ? streamError : 'Connection error. Please try again.';
      setIsStreaming(false);
      setToast(msg);
      setMessages((prev) => prev.map((message) =>
        message.id === assistantMessageId
          ? { ...message, content: msg, isError: true }
          : message
      ));
    };

    streamTeacherChat(
      request,
      handleChunk,
      handleDone,
      handleError,
      (eventData) => {
        if (eventData.type === 'quiz_ready') {
          return;
        }
        if (eventData.type === 'chapter_completed') {
          setChapterCompleted(true);
          onChapterCompleted?.();
        }
      }
    );
  }, [
    attachAssistantChunk,
    chapterId,
    finalizeAssistantMessage,
    onChapterCompleted,
  ]);

  const startConversation = useCallback((messageText, replaceMessages = false) => {
    if (!chapterId || isStreamingRef.current) return;

    setIsStreaming(true);
    setToast(null);

    const timestamp = new Date().toISOString();
    const userMessage = {
      id: uuidv4(),
      role: 'user',
      content: messageText,
      timestamp,
    };
    const assistantMessageId = uuidv4();
    const assistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp,
    };

    setMessages((prev) => (replaceMessages ? [userMessage, assistantMessage] : [...prev, userMessage, assistantMessage]));
    emitStream(messageText, assistantMessageId);
  }, [chapterId, emitStream]);

  const resumeConversation = useCallback(() => {
    if (!chapterId || isStreamingRef.current) {
      return;
    }

    const assistantMessageId = uuidv4();
    setIsStreaming(true);
    setToast(null);

    streamTeacherChat(
      {
        chapter_id: chapterId,
        resume_stream: true,
      },
      (chunk) => appendResumedAssistantChunk(assistantMessageId, chunk),
      () => {
        setIsStreaming(false);
        finalizeAssistantMessage(
          assistantMessageId,
          "The AI couldn't generate a response. Please try again."
        );
      },
      (streamError) => {
        const msg = typeof streamError === 'string' ? streamError : 'Connection error. Please try again.';
        setIsStreaming(false);
        setToast(msg);
        setMessages((prev) => {
          const exists = prev.some((m) => m.id === assistantMessageId);
          if (exists) {
            return prev.map((m) => m.id === assistantMessageId ? { ...m, content: msg, isError: true } : m);
          }
          return [...prev, { id: assistantMessageId, role: 'assistant', content: msg, isError: true, timestamp: new Date().toISOString() }];
        });
      },
      (eventData) => {
        if (eventData.type === 'chapter_completed') {
          setChapterCompleted(true);
          onChapterCompleted?.();
        }
      },
      (eventData) => replaceResumedAssistantContent(assistantMessageId, eventData.content || '')
    );
  }, [
    appendResumedAssistantChunk,
    chapterId,
    finalizeAssistantMessage,
    onChapterCompleted,
    replaceResumedAssistantContent,
  ]);

  useEffect(() => {
    resumeConversationRef.current = resumeConversation;
  }, [resumeConversation]);

  useEffect(() => {
    if (!chapterId) return;

    const controller = new AbortController();

    const loadHistory = async () => {
      try {
        const history = await apiService.getChapterMessages(chapterId, 'teacher', controller.signal);
        if (controller.signal.aborted) return;

        if (history?.length) {
          const filteredHistory = history.filter(
            (message) => message.role === 'assistant' || message.role === 'user'
          );
          const hydratedHistory = filteredHistory.map((message) => ({
            ...message,
            id: message.id || uuidv4(),
            timestamp: message.created_at || new Date().toISOString(),
          }));
          setMessages(hydratedHistory);
          if (hydratedHistory[hydratedHistory.length - 1]?.role === 'user') {
            resumeConversationRef.current();
          }
          scrollToLatestMessage();
          return;
        }

        const autoStartKey = `teacher:${chapterId}`;
        if (autoStartRef.current === autoStartKey || isStreamingRef.current) {
          return;
        }

        autoStartRef.current = autoStartKey;
        startConversation('Ready to start learning this chapter!', true);
      } catch (err) {
        if (err.code === 'ERR_CANCELED') return;
        console.error('Failed to load chat history:', err);
        setToast('Failed to load chat history. Please refresh the page.');
      }
    };

    loadHistory();

    return () => controller.abort();
  }, [chapterId, scrollToLatestMessage, startConversation]);

  const handleSend = () => {
    if (!input.trim() || isStreaming || !chapterId) return;
    const currentInput = input.trim();
    setInput('');
    startConversation(currentInput);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleQuizComplete = async () => {
    if (!chapterId) return;

    try {
      const response = await apiService.getChapter(chapterId);
      setChapterCompleted((response.status || '').toLowerCase() === 'completed');
      if ((response.status || '').toLowerCase() === 'completed') {
        onChapterCompleted?.();
      }
    } catch (err) {
      console.error('Failed to refresh chapter status:', err);
    }
  };

  const placeholderText = chapterCompleted
    ? 'Chapter complete. You can still ask follow-up questions.'
    : 'Ask a question or say continue...';

  return (
    <>
    <div className="chat-container">
      <div className="chat-header" style={{ justifyContent: 'space-between' }}>
        <h2>
          <span>Teacher Session</span>
        </h2>
      </div>

      <div className="messages-list" ref={chatListRef}>
        <div className="messages-inner">
          {messages.length === 0 && !toast ? (
            <div style={{ margin: 'auto', color: 'hsl(var(--text-muted))', textAlign: 'center' }}>
              <p>Start chatting with your teacher to learn this chapter.</p>
            </div>
          ) : (
            messages.map((message, index) => (
              <Message
                key={message.id}
                message={message}
                chapterId={chapterId}
                isStreaming={isStreaming && index === messages.length - 1 && message.role === 'assistant'}
                onQuizComplete={handleQuizComplete}
              />
            ))
          )}

          {chapterCompleted && (
            <div className="chapter-complete-banner">
              <Trophy size={28} className="chapter-complete-icon" />
              <div>
                <h3>Chapter Completed! 🎉</h3>
                <p>The next chapter is now unlocked in your learning path.</p>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="chat-input-container">
        <div className="input-wrapper">
          <textarea
            className="chat-textarea"
            placeholder={placeholderText}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
    <Toast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
};

import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { QuizCard, parseQuizJSON } from './QuizCard';

export const Message = ({ message, chapterId, isStreaming, hideCurriculum, onQuizComplete }) => {
  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';

  if (!isAssistant && !isUser) return null;

  let displayContent = message.content || '';

  if (hideCurriculum && isAssistant) {
    if (/<curriculum>/i.test(displayContent)) {
      displayContent = displayContent.replace(
        /<curriculum>[\s\S]*?(?:<\/curriculum>|$)/i, 
        '\n\n> *Curriculum mapped to canvas.*\n\n'
      );
    }
  }

  // Check if this is a quiz message (only for assistant)
  const quizData = useMemo(() => {
    if (!isAssistant) return null;
    return parseQuizJSON(displayContent);
  }, [isAssistant, displayContent]);

  // If it's a quiz, we want to hide the raw JSON/markdown while it's still being delivered
  const isQuizMessage = useMemo(() => {
    return isAssistant && (quizData || /^\s*```json/i.test(displayContent) || /^\s*\{/i.test(displayContent));
  }, [isAssistant, quizData, displayContent]);

  return (
    <div className={clsx('message-wrapper', isAssistant ? 'message-assistant' : 'message-user')}>
      <div className={clsx('avatar', isAssistant ? 'ai-avatar' : 'user-avatar')}>
        {isAssistant ? <Bot size={20} /> : <User size={20} />}
      </div>
      <div className="message-bubble">
        {quizData ? (
          <QuizCard quizData={quizData} chapterId={chapterId} onQuizComplete={onQuizComplete} />
        ) : isQuizMessage ? (
          <div className="quiz-skeleton">
            <Loader2 className="animate-spin" size={20} />
            <span>Preparing your quiz...</span>
          </div>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {displayContent}
            </ReactMarkdown>
            {isStreaming && isAssistant && <span className="streaming-cursor" />}
          </div>
        )}
      </div>
    </div>
  );
};

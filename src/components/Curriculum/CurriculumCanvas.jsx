import React, { useMemo } from 'react';
import { BookOpen, ChevronRight } from 'lucide-react';
import './CurriculumCanvas.css';

/**
 * Parse markdown curriculum into structured chapters.
 */
export const parseCurriculum = (markdown) => {
  const lines = markdown.split('\n');
  let topicTitle = '';
  const chapters = [];
  let currentChapter = null;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('## ') && !trimmed.startsWith('### ')) {
      topicTitle = trimmed.replace(/^##\s+/, '');
      continue;
    }

    if (trimmed.startsWith('### ')) {
      if (currentChapter) chapters.push(currentChapter);
      currentChapter = {
        title: trimmed.replace(/^###\s+/, ''),
        items: [],
      };
      continue;
    }

    const listMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (listMatch && currentChapter) {
      currentChapter.items.push(listMatch[1]);
    }
  }

  if (currentChapter) chapters.push(currentChapter);
  return { topicTitle, chapters };
};

/**
 * Detect if a message contains a curriculum structure.
 */
export const isCurriculumMessage = (content) => {
  if (!content) return false;
  if (/<curriculum>/i.test(content)) return true;
  
  // Fallback for older formats
  const hasTopicHeading = /^##\s+.+/m.test(content);
  const chapterCount = (content.match(/^###\s+.+/gm) || []).length;
  const hasNumberedItems = /^\d+\.\s+.+/m.test(content);
  return hasTopicHeading && chapterCount >= 2 && hasNumberedItems;
};

/**
 * Extract the latest curriculum content from the messages array.
 */
export const extractCurriculumFromMessages = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant') {
      const xmlMatch = msg.content.match(/<curriculum>([\s\S]*?)(?:<\/curriculum>|$)/i);
      if (xmlMatch) return xmlMatch[1];
      
      if (isCurriculumMessage(msg.content)) {
        return msg.content;
      }
    }
  }
  return null;
};

export const CurriculumCanvas = ({ content, onClose }) => {
  const { topicTitle, chapters } = useMemo(() => parseCurriculum(content), [content]);

  if (chapters.length === 0) return null;

  return (
    <div className="canvas-panel">
      <div className="canvas-panel-header">
        <div className="canvas-panel-title-row">
          <BookOpen size={20} className="canvas-panel-icon" />
          <h3>Curriculum Overview</h3>
        </div>
        {onClose && (
          <button className="canvas-close-btn" onClick={onClose} title="Close panel">
            <ChevronRight size={20} />
          </button>
        )}
      </div>

      <div className="canvas-panel-body">
        {topicTitle && (
          <h2 className="canvas-topic-title">{topicTitle}</h2>
        )}

        <div className="canvas-chapter-list">
          {chapters.map((chapter, index) => (
            <div
              key={index}
              className="canvas-chapter-card"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="canvas-card-header">
                <span className="canvas-chapter-num">{index + 1}</span>
                <h4 className="canvas-chapter-title">{chapter.title}</h4>
              </div>
              <ul className="canvas-outline-list">
                {chapter.items.map((item, i) => (
                  <li key={i} className="canvas-outline-item">
                    <span className="canvas-item-dot" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

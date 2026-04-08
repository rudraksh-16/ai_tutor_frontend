import React, { useState } from 'react';
import { Send, Sparkles, Book, Code, Globe, Database, Terminal, Loader2 } from 'lucide-react';
import './WelcomeView.css';

const suggestions = [
  { icon: <Code size={24} />, title: "Python for Beginners" },
  { icon: <Globe size={24} />, title: "Modern Web Development" },
  { icon: <Database size={24} />, title: "Data Science Basics" },
  { icon: <Terminal size={24} />, title: "Machine Learning with AI" },
  { icon: <Sparkles size={24} />, title: "Design Patterns in React" },
  { icon: <Book size={24} />, title: "Systems Design & Scaling" }
];

export const WelcomeView = ({ onCreateTopic, isLoading }) => {
  const [topic, setTopic] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (topic.trim() && !isLoading) {
      onCreateTopic(topic.trim());
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestionClick = (s) => {
    if (!isLoading) {
      onCreateTopic(s.title);
    }
  };

  return (
    <div className="welcome-container">
      <div className="welcome-header">
        <h1 className="text-gradient">What do you want to learn today?</h1>
        <p>Expert AI-driven curriculum generation and personalized tutoring at your fingertips.</p>
      </div>

      <form className="welcome-input-wrapper" onSubmit={handleSubmit}>
        <div className="welcome-prompt-bar">
          <input
            className="welcome-input"
            placeholder="Enter the topic you want to learn (e.g. 'Advanced React Patterns')"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            type="submit"
            className="welcome-submit-btn"
            disabled={!topic.trim() || isLoading}
          >
            {isLoading ? <Loader2 size={24} className="animate-spin" /> : <Send size={24} />}
          </button>
        </div>
      </form>

      <div className="suggestions-grid">
        {suggestions.map((s, idx) => (
          <button
            key={idx}
            className="suggestion-card glass"
            onClick={() => handleSuggestionClick(s)}
            disabled={isLoading}
          >
            <div className="suggestion-icon">{s.icon}</div>
            <span>{s.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api';
import { Loader2, CheckCircle2, AlertCircle, RefreshCcw, Sparkles } from 'lucide-react';
import './InlineQuiz.css';

export const InlineQuiz = ({ sectionId, onPass }) => {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    loadQuiz(controller.signal);
    return () => controller.abort();
  }, [sectionId]);

  const loadQuiz = async (signal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiService.getSectionQuiz(sectionId, signal);
      setQuestions(data);
    } catch (err) {
      if (err.code === 'ERR_CANCELED') return;
      if (err.response?.status === 404) {
        setQuestions([]);
      } else {
        setError('Could not load quiz questions.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    try {
      const data = await apiService.generateSectionQuiz(sectionId);
      if (!data || data.length === 0) {
        throw new Error("No questions were generated. Please try again.");
      }
      setQuestions(data);
    } catch (err) {
      setError(err.message || 'Failed to generate quiz. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleOptionSelect = (qId, option) => {
    if (result) return;
    const optionLetter = option.charAt(0); // A, B, C, D
    setAnswers(prev => ({ ...prev, [qId]: optionLetter }));
  };

  const handleSubmit = async () => {
    if (Object.keys(answers).length < questions.length) {
      alert('Please answer all questions before submitting.');
      return;
    }

    setGenerating(true);
    try {
      const submission = questions.map(q => ({
        question_id: q.id,
        selected_option: answers[q.id]
      }));
      const res = await apiService.submitSectionQuiz(sectionId, submission);
      setResult(res);
      if (res.passed && onPass) {
        onPass();
      }
    } catch (err) {
      setError('Failed to submit quiz.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="iq-loading"><Loader2 className="animate-spin" /> Gathering questions...</div>;

  if (questions.length === 0) {
    return (
      <div className="iq-empty glass">
        <div className="iq-empty-icon"><Sparkles size={24} /></div>
        <h3>Knowledge Check</h3>
        <p>Ready to verify what you've learned in this section?</p>
        <button 
          className="iq-generate-btn" 
          onClick={handleGenerate}
          disabled={generating}
        >
          {generating ? <Loader2 className="animate-spin" size={16} /> : 'Generate Section Quiz'}
        </button>
        {error && <p className="iq-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="iq-container glass">
      <div className="iq-header">
        <div className="iq-header-main">
          <h3 className="iq-title">Section Quiz</h3>
          <span className="iq-threshold-tag">Pass: 80%</span>
        </div>
        {result && (
          <div className={`iq-summary ${result.passed ? 'passed' : 'failed'}`}>
            {result.passed ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{result.score}/{result.total} {result.passed ? 'Passed!' : 'Try Again'}</span>
          </div>
        )}
      </div>

      <div className="iq-questions">
        {questions.map((q, idx) => {
          const feedback = result?.feedback.find(f => f.question_id === q.id);
          const isCorrect = feedback?.is_correct;
          
          return (
            <div key={q.id} className="iq-question-item">
              <p className="iq-q-text">
                <span className="iq-q-num">{idx + 1}.</span> {q.question_text}
              </p>
              <div className="iq-options">
                {(!q.options || q.options.length === 0) ? (
                  <p className="iq-error-small">Options failed to load. Please redo or contact support.</p>
                ) : (
                  q.options.map(opt => {
                    const letter = opt.trim().charAt(0).toUpperCase();
                    const isSelected = answers[q.id] === letter;
                    
                    let optClass = 'iq-opt-btn';
                    if (isSelected) optClass += ' selected';
                    if (result) {
                       if (letter === feedback?.correct_answer) optClass += ' correct';
                       else if (isSelected && !isCorrect) optClass += ' incorrect';
                    }

                    return (
                      <button
                        key={opt}
                        className={optClass}
                        onClick={() => handleOptionSelect(q.id, opt)}
                        disabled={!!result}
                      >
                        {opt}
                      </button>
                    );
                  })
                )}
              </div>
              {result && feedback?.explanation && (
                <div className="iq-explanation">
                  <strong>Explanation:</strong> {feedback.explanation}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!result ? (
        <div className="iq-footer">
          <button 
            className="iq-submit-btn" 
            onClick={handleSubmit}
            disabled={generating}
          >
            {generating ? <Loader2 className="animate-spin" size={16} /> : 'Submit Quiz'}
          </button>
        </div>
      ) : (
        !result.passed && (
          <div className="iq-footer">
            <button className="iq-retry-btn" onClick={() => {
              setResult(null);
              setAnswers({});
            }}>
              <RefreshCcw size={16} />
              Redo Quiz
            </button>
          </div>
        )
      )}
    </div>
  );
};

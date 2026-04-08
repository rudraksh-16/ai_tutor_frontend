import React, { useState, useMemo } from 'react';
import { CheckCircle2, XCircle, Award, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { apiService } from '../../services/api';
import './QuizCard.css';

/**
 * Try to parse quiz JSON from an assistant message.
 * The quiz agent returns JSON like:
 * { "1": { "Question": "...", "options": "A)... B)...", "correct_answer": "B", "explanation": "..." } }
 */
export const parseQuizJSON = (content) => {
  if (!content) return null;

  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    try {
      const jsonStr = match[1].strip ? match[1].strip() : match[1].trim();
      const parsed = JSON.parse(jsonStr);
      
      // Handle the new structured format: { section_id, quiz }
      if (parsed.section_id && parsed.quiz) {
         const quizBody = typeof parsed.quiz === 'string' ? JSON.parse(parsed.quiz) : parsed.quiz;
         return { ...quizBody, section_id: parsed.section_id };
      }

      if (isValidQuiz(parsed)) return parsed;
    } catch (e) {
      // Continue
    }
  }

  // Fallback for raw JSON without code blocks
  const jsonRegex = /\{[\s\S]*?"(?:Question|question)"[\s\S]*?\}/gi;
  const jsonMatches = content.match(jsonRegex);
  if (jsonMatches) {
    for (const m of jsonMatches) {
      try {
        const parsed = JSON.parse(m.trim());
        if (isValidQuiz(parsed)) return parsed;
      } catch (e) {}
    }
  }

  return null;
};

const isValidQuiz = (obj) => {
  if (!obj || typeof obj !== 'object') return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  const firstEntry = obj[keys[0]];
  return !!(firstEntry && (firstEntry.Question || firstEntry.question));
};

const parseOptions = (optionsStr) => {
  if (!optionsStr) return [];
  if (Array.isArray(optionsStr)) return optionsStr;
  const parts = optionsStr.split(/(?=[A-D]\))/g).filter(Boolean);
  return parts.map(p => p.trim());
};

const getOptionLetter = (option) => {
  const match = option.match(/^([A-D])\)/);
  return match ? match[1] : '';
};

export const QuizCard = ({ quizData, chapterId, onQuizComplete }) => {
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [expandedExplanations, setExpandedExplanations] = useState({});

  const questions = useMemo(() => {
    const keys = Object.keys(quizData).sort((a, b) => Number(a) - Number(b));
    return keys.map((key, idx) => {
      const q = quizData[key];
      return {
        id: key,
        number: idx + 1,
        question: q.Question || q.question,
        options: parseOptions(q.options),
      };
    });
  }, [quizData]);

  const handleSelect = (questionId, optionLetter) => {
    if (submitted) return;
    setSelectedAnswers(prev => ({ ...prev, [questionId]: optionLetter }));
  };

  const handleSubmit = async () => {
    if (Object.keys(selectedAnswers).length < questions.length || submitting) return;

    setSubmitting(true);

    try {
      // Build answers in the format: [{ question_id, selected_option }]
      // Note: The backend expects actual QuizQuestion UUIDs, but since we parsed
      // from LLM JSON (numbered keys), we need the backend quiz questions.
      // For now, use the chapter-level submit which handles scoring.
      const answers = questions.map(q => ({
        question_id: q.id,
        selected_option: selectedAnswers[q.id] || '',
      }));

      let response;
      if (quizData.section_id) {
        response = await apiService.submitSectionQuiz(quizData.section_id, answers);
      } else {
        response = await apiService.submitQuiz(chapterId, answers);
      }

      setResult(response);
      setSubmitted(true);

      if (response.passed && onQuizComplete) {
        onQuizComplete(response.score, response.total);
      }
    } catch (err) {
      console.error('Quiz submission failed:', err);
      // Fallback: mark submitted locally so user isn't stuck
      setSubmitted(true);
      if (onQuizComplete) {
        onQuizComplete(0, questions.length);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleExplanation = (questionId) => {
    setExpandedExplanations(prev => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const allAnswered = Object.keys(selectedAnswers).length >= questions.length;

  // Build feedback map from backend result
  const feedbackMap = useMemo(() => {
    if (!result?.feedback) return {};
    const map = {};
    result.feedback.forEach(f => {
      map[f.question_id] = f;
    });
    return map;
  }, [result]);

  return (
    <div className="quiz-card-container">
      <div className="quiz-card-header">
        <Award size={20} />
        <h3>Quiz Time!</h3>
        <span className="quiz-question-count">{questions.length} questions</span>
      </div>

      <div className="quiz-questions">
        {questions.map((q) => {
          const userAnswer = selectedAnswers[q.id] || '';
          const feedback = feedbackMap[q.id];
          const isCorrect = feedback?.is_correct;
          const isWrong = feedback && !feedback.is_correct;

          return (
            <div
              key={q.id}
              className={`quiz-question ${submitted ? (isCorrect ? 'correct' : 'wrong') : ''}`}
            >
              <p className="quiz-question-text">
                <span className="quiz-q-number">{q.number}.</span>
                {q.question}
              </p>

              <div className="quiz-options">
                {q.options.map((option) => {
                  const letter = getOptionLetter(option);
                  const isSelected = userAnswer === letter;
                  const isCorrectOption = submitted && feedback && letter === feedback.correct_answer;
                  const isWrongSelected = submitted && isSelected && feedback && !feedback.is_correct;

                  return (
                    <button
                      key={option}
                      className={`quiz-option ${isSelected && !submitted ? 'selected' : ''} ${isCorrectOption ? 'correct-option' : ''} ${isWrongSelected ? 'wrong-option' : ''}`}
                      onClick={() => handleSelect(q.id, letter)}
                      disabled={submitted}
                    >
                      <span className="quiz-option-letter">{letter}</span>
                      <span className="quiz-option-text">{option.replace(/^[A-D]\)\s*/, '')}</span>
                      {submitted && isCorrectOption && <CheckCircle2 size={16} className="quiz-icon-correct" />}
                      {submitted && isWrongSelected && <XCircle size={16} className="quiz-icon-wrong" />}
                    </button>
                  );
                })}
              </div>

              {submitted && feedback?.explanation && (
                <div className="quiz-explanation-wrapper">
                  <button
                    className="quiz-explanation-toggle"
                    onClick={() => toggleExplanation(q.id)}
                  >
                    {expandedExplanations[q.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span>Explanation</span>
                  </button>
                  {expandedExplanations[q.id] && (
                    <p className="quiz-explanation">{feedback.explanation}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {submitted && result && (
        <div className="quiz-result-banner">
          <div className="quiz-result-score">
            <Award size={24} />
            <span>{result.score} / {result.total} correct</span>
          </div>
          <div className="quiz-result-message">
            {result.passed ? (
              <>
                <h4>Chapter Complete! 🎉</h4>
                <p>The next chapter is now unlocked in your sidebar.</p>
              </>
            ) : (
              <>
                <h4>Keep practicing! 💪</h4>
                <p>You need 80% to pass. Review the material and try again.</p>
              </>
            )}
          </div>
        </div>
      )}

      {!submitted && (
        <button
          className={`quiz-submit-btn ${!allAnswered || submitting ? 'disabled' : ''}`}
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
        >
          {submitting ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              Submitting...
            </>
          ) : (
            'Submit Quiz'
          )}
        </button>
      )}
    </div>
  );
};

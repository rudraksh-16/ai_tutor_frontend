import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, XCircle, Award, ChevronDown, ChevronUp, Loader2, RotateCcw } from 'lucide-react';
import { apiService } from '../../services/api';
import './QuizCard.css';

const PASS_THRESHOLD = 0.7;

export const parseQuizJSON = (content) => {
  if (!content) return null;

  const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    try {
      const jsonStr = match[1].trim();
      const parsed = JSON.parse(jsonStr);
      if (isValidQuiz(parsed)) return parsed;
    } catch {
      // Continue parsing other code blocks.
    }
  }

  const jsonRegex = /\{[\s\S]*?"(?:Question|question)"[\s\S]*?\}/gi;
  const jsonMatches = content.match(jsonRegex);
  if (jsonMatches) {
    for (const candidate of jsonMatches) {
      try {
        const parsed = JSON.parse(candidate.trim());
        if (isValidQuiz(parsed)) return parsed;
      } catch {
        // Ignore invalid candidates.
      }
    }
  }

  return null;
};

const isValidQuiz = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  if (!keys.length) return false;
  const firstEntry = value[keys[0]];
  return Boolean(firstEntry && (firstEntry.Question || firstEntry.question));
};

const parseOptions = (optionsValue) => {
  if (!optionsValue) return [];
  if (Array.isArray(optionsValue)) return optionsValue;
  return optionsValue.split(/(?=[A-D]\))/g).filter(Boolean).map((part) => part.trim());
};

const getOptionLetter = (option) => {
  const match = option.match(/^([A-D])\)/);
  return match ? match[1] : '';
};

const hashString = (value) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(index);
    hash |= 0;
  }
  return `quiz_${Math.abs(hash)}`;
};

export const QuizCard = ({ quizData, chapterId, onQuizComplete }) => {
  const [selectedAnswers, setSelectedAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [expandedExplanations, setExpandedExplanations] = useState({});
  const [isHydrating, setIsHydrating] = useState(true);

  const hydratedRef = useRef(false);
  const persistTimerRef = useRef(null);

  const questions = useMemo(() => {
    const keys = Object.keys(quizData).sort((a, b) => Number(a) - Number(b));
    return keys.map((key, index) => {
      const question = quizData[key];
      return {
        id: key,
        number: index + 1,
        question: question.Question || question.question,
        options: parseOptions(question.options),
        correctAnswer: (question.correct_answer || '').trim().toUpperCase(),
        explanation: question.explanation || '',
      };
    });
  }, [quizData]);

  const quizKey = useMemo(
    () => hashString(JSON.stringify(quizData)),
    [quizData]
  );

  const feedbackMap = useMemo(() => {
    if (!result?.feedback) return {};
    const map = {};
    result.feedback.forEach((item) => {
      map[item.question_id] = item;
    });
    return map;
  }, [result]);

  useEffect(() => {
    let active = true;
    hydratedRef.current = false;
    setIsHydrating(true);
    setSelectedAnswers({});
    setSubmitted(false);
    setResult(null);
    setExpandedExplanations({});

    const hydrateState = async () => {
      try {
        const savedState = await apiService.getChapterQuizState(chapterId, quizKey);
        if (!active || !savedState) {
          return;
        }

        setSelectedAnswers(savedState.selected_answers || {});
        setSubmitted(Boolean(savedState.submitted));
        if (savedState.submitted) {
          const restoredScore = savedState.score ?? 0;
          const restoredTotal = savedState.total ?? questions.length;
          setResult({
            score: restoredScore,
            total: restoredTotal,
            passed: restoredTotal > 0 ? restoredScore / restoredTotal >= PASS_THRESHOLD : false,
            feedback: savedState.feedback || [],
          });
        }
      } catch (err) {
        if (!active) return;
        console.error('Failed to hydrate quiz state:', err);
      } finally {
        if (!active) return;
        hydratedRef.current = true;
        setIsHydrating(false);
      }
    };

    hydrateState();

    return () => {
      active = false;
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [chapterId, quizKey, questions.length]);

  useEffect(() => {
    if (!hydratedRef.current || submitted) return undefined;

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }

    persistTimerRef.current = setTimeout(() => {
      apiService.saveChapterQuizState(chapterId, {
        quiz_key: quizKey,
        selected_answers: selectedAnswers,
        submitted: false,
        feedback: [],
      }).catch((err) => {
        console.error('Failed to persist quiz draft:', err);
      });
    }, 250);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [chapterId, quizKey, selectedAnswers, submitted]);

  const handleSelect = (questionId, optionLetter) => {
    if (submitted || isHydrating) return;
    setSelectedAnswers((prev) => ({ ...prev, [questionId]: optionLetter }));
  };

  const handleSubmit = async () => {
    if (Object.keys(selectedAnswers).length < questions.length || submitting) return;

    setSubmitting(true);

    try {
      const feedback = questions.map((question) => {
        const selectedOption = selectedAnswers[question.id] || '';
        const isCorrect = selectedOption === question.correctAnswer;
        return {
          question_id: question.id,
          selected_option: selectedOption,
          correct_answer: question.correctAnswer,
          explanation: question.explanation,
          is_correct: isCorrect,
        };
      });

      const nextResult = {
        score: feedback.filter((item) => item.is_correct).length,
        total: questions.length,
        passed: questions.length > 0
          ? feedback.filter((item) => item.is_correct).length / questions.length >= PASS_THRESHOLD
          : false,
        feedback,
      };

      const persisted = await apiService.saveChapterQuizState(chapterId, {
        quiz_key: quizKey,
        selected_answers: selectedAnswers,
        submitted: true,
        score: nextResult.score,
        total: nextResult.total,
        passed: nextResult.passed,
        feedback,
      });

      const finalResult = {
        score: persisted?.score ?? nextResult.score,
        total: persisted?.total ?? nextResult.total,
        passed: (persisted?.total ?? nextResult.total) > 0
          ? (persisted?.score ?? nextResult.score) / (persisted?.total ?? nextResult.total) >= PASS_THRESHOLD
          : false,
        feedback: persisted?.feedback?.length ? persisted.feedback : feedback,
      };

      setResult(finalResult);
      setSubmitted(true);

      if (finalResult.passed) {
        onQuizComplete?.(finalResult.score, finalResult.total);
      }
    } catch (err) {
      console.error('Quiz submission failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetake = async () => {
    setSelectedAnswers({});
    setSubmitted(false);
    setSubmitting(false);
    setResult(null);
    setExpandedExplanations({});

    try {
      await apiService.saveChapterQuizState(chapterId, {
        quiz_key: quizKey,
        selected_answers: {},
        submitted: false,
        feedback: [],
      });
    } catch (err) {
      console.error('Failed to reset quiz draft:', err);
    }
  };

  const toggleExplanation = (questionId) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [questionId]: !prev[questionId],
    }));
  };

  const allAnswered = Object.keys(selectedAnswers).length >= questions.length;

  return (
    <div className="quiz-card-container">
      <div className="quiz-card-header">
        <Award size={20} />
        <h3>Quiz Time!</h3>
        <span className="quiz-question-count">{questions.length} questions</span>
      </div>

      <div className="quiz-threshold-note">
        Pass threshold: 70%
      </div>

      <div className="quiz-questions">
        {questions.map((question) => {
          const userAnswer = selectedAnswers[question.id] || '';
          const feedback = feedbackMap[question.id];
          const isCorrect = feedback?.is_correct;

          return (
            <div
              key={question.id}
              className={`quiz-question ${submitted ? (isCorrect ? 'correct' : 'wrong') : ''}`}
            >
              <p className="quiz-question-text">
                <span className="quiz-q-number">{question.number}.</span>
                {question.question}
              </p>

              <div className="quiz-options">
                {question.options.map((option) => {
                  const letter = getOptionLetter(option);
                  const isSelected = userAnswer === letter;
                  const isCorrectOption = submitted && feedback && letter === feedback.correct_answer;
                  const isWrongSelected = submitted && isSelected && feedback && !feedback.is_correct;

                  return (
                    <button
                      key={option}
                      className={`quiz-option ${isSelected && !submitted ? 'selected' : ''} ${isCorrectOption ? 'correct-option' : ''} ${isWrongSelected ? 'wrong-option' : ''}`}
                      onClick={() => handleSelect(question.id, letter)}
                      disabled={submitted || isHydrating}
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
                    onClick={() => toggleExplanation(question.id)}
                  >
                    {expandedExplanations[question.id] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    <span>Explanation</span>
                  </button>
                  {expandedExplanations[question.id] && (
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
                <p>You met the 70% pass threshold. Your attempt was saved and the next chapter is now unlocked.</p>
              </>
            ) : (
              <>
                <h4>Keep practicing! 💪</h4>
                <p>You need 70% to pass. Your answers were saved, so you can review and try again when you’re ready.</p>
              </>
            )}
          </div>
        </div>
      )}

      {!submitted ? (
        <button
          className={`quiz-submit-btn ${!allAnswered || submitting || isHydrating ? 'disabled' : ''}`}
          onClick={handleSubmit}
          disabled={!allAnswered || submitting || isHydrating}
        >
          {submitting || isHydrating ? (
            <>
              <Loader2 className="animate-spin" size={16} />
              {isHydrating ? 'Restoring Quiz...' : 'Submitting...'}
            </>
          ) : (
            'Submit Quiz'
          )}
        </button>
      ) : (
        <button className="quiz-secondary-btn" onClick={handleRetake}>
          <RotateCcw size={16} />
          Retake Quiz
        </button>
      )}
    </div>
  );
};

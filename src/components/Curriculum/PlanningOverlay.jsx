import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, CheckCircle2, Rocket } from 'lucide-react';
import { apiService, openPlanningStatusSocket } from '../../services/api';
import './PlanningOverlay.css';

const MAX_FALLBACK_POLLS = 30;
const INITIAL_POLL_DELAY_MS = 3000;
const MAX_POLL_DELAY_MS = 30000;

export const PlanningOverlay = ({ topicId }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState({
    total_chapters: 0,
    planned_chapters: 0,
    planning_complete: false,
  });
  const pollTimeoutRef = useRef(null);
  const pollAttemptRef = useRef(0);
  const socketRef = useRef(null);
  const fallbackStartedRef = useRef(false);
  const planningCompleteRef = useRef(false);

  useEffect(() => {
    if (!topicId) return;

    let isMounted = true;
    fallbackStartedRef.current = false;
    planningCompleteRef.current = false;
    pollAttemptRef.current = 0;

    const stopPolling = () => {
      if (pollTimeoutRef.current) {
        clearTimeout(pollTimeoutRef.current);
        pollTimeoutRef.current = null;
      }
    };

    const closeSocket = () => {
      if (socketRef.current) {
        const socket = socketRef.current;
        socketRef.current = null;
        socket.close();
      }
    };

    const handleStatusUpdate = (data) => {
      if (!isMounted || !data) return;

      planningCompleteRef.current = Boolean(data.planning_complete);
      setStatus(data);

      if (data.planning_complete) {
        stopPolling();
        closeSocket();
      }
    };

    const startPolling = () => {
      if (!isMounted || pollTimeoutRef.current || fallbackStartedRef.current) return;

      fallbackStartedRef.current = true;

      const poll = async () => {
        if (!isMounted) return;
        if (pollAttemptRef.current >= MAX_FALLBACK_POLLS) {
          stopPolling();
          return;
        }

        pollAttemptRef.current += 1;

        try {
          const data = await apiService.getPlanningStatus(topicId);
          handleStatusUpdate(data);
        } catch (err) {
          console.error('Polling error:', err);
        }

        if (!isMounted || planningCompleteRef.current) return;

        const delay = Math.min(
          INITIAL_POLL_DELAY_MS * (2 ** Math.min(pollAttemptRef.current - 1, 4)),
          MAX_POLL_DELAY_MS
        );
        pollTimeoutRef.current = setTimeout(poll, delay);
      };

      poll();
    };

    socketRef.current = openPlanningStatusSocket(topicId, {
      onStatus: (data) => {
        stopPolling();
        fallbackStartedRef.current = false;
        handleStatusUpdate(data);
      },
      onError: (error) => {
        console.error('Planner WebSocket error:', error);
        startPolling();
      },
      onClose: () => {
        if (!planningCompleteRef.current) {
          startPolling();
        }
      },
    });

    return () => {
      isMounted = false;
      stopPolling();
      closeSocket();
    };
  }, [topicId]);

  const progress = status.total_chapters > 0
    ? Math.round((status.planned_chapters / status.total_chapters) * 100)
    : 0;

  return (
    <div className="planning-overlay">
      <div className="planning-card glass">
        {!status.planning_complete ? (
          <>
            <div className="planning-icon-wrapper">
              <Sparkles size={48} className="planning-sparkle" />
            </div>
            <h2 className="text-gradient">Preparing Your Curriculum...</h2>
            <p className="planning-subtitle">
              Our AI is finalizing the structure for your learning journey.
            </p>

            <div className="progress-section">
              <div className="progress-bar-track">
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="progress-label">
                <span>{status.planned_chapters} / {status.total_chapters} chapters analyzed</span>
                <span>{progress}%</span>
              </div>
            </div>

            <div className="planning-loader">
              <Loader2 size={20} className="animate-spin" />
              <span>This will just take a moment...</span>
            </div>
          </>
        ) : (
          <>
            <div className="planning-icon-wrapper complete">
              <CheckCircle2 size={48} className="planning-check" />
            </div>
            <h2 className="text-gradient">Your Journey is Ready!</h2>
            <p className="planning-subtitle">
              The curriculum has been finalized. Time to start learning!
            </p>

            <button
              className="planning-start-btn"
              onClick={() => navigate(`/topic/${topicId}/learn`)}
            >
              <Rocket size={20} />
              Let's Start Learning
            </button>
          </>
        )}
      </div>
    </div>
  );
};

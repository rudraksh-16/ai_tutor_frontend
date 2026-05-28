import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, CheckCircle2, Rocket } from 'lucide-react';
import { apiService, openPlanningStatusSocket } from '../../services/api';
import './PlanningOverlay.css';

export const PlanningOverlay = ({ topicId }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState({
    total_chapters: 0,
    planned_chapters: 0,
    planning_complete: false,
  });
  const pollIntervalRef = useRef(null);
  const socketRef = useRef(null);
  const fallbackStartedRef = useRef(false);
  const planningCompleteRef = useRef(false);

  useEffect(() => {
    if (!topicId) return;

    let isMounted = true;
    fallbackStartedRef.current = false;
    planningCompleteRef.current = false;

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
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
      if (!isMounted || pollIntervalRef.current || fallbackStartedRef.current) return;

      fallbackStartedRef.current = true;

      const poll = async () => {
        if (!isMounted) return;

        try {
          const data = await apiService.getPlanningStatus(topicId);
          handleStatusUpdate(data);
        } catch (err) {
          console.error('Polling error:', err);
        }
      };

      poll();
      pollIntervalRef.current = setInterval(poll, 3000);
    };

    socketRef.current = openPlanningStatusSocket(topicId, {
      onStatus: (data) => {
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

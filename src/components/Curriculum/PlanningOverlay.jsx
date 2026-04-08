import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles, CheckCircle2, Rocket } from 'lucide-react';
import { apiService } from '../../services/api';
import './PlanningOverlay.css';

export const PlanningOverlay = ({ topicId }) => {
  const navigate = useNavigate();
  const [status, setStatus] = useState({
    total_chapters: 0,
    planned_chapters: 0,
    planning_complete: false,
  });
  const pollIntervalRef = useRef(null);

  useEffect(() => {
    if (!topicId) return;

    let isMounted = true;

    // ── HTTP Polling ──
    const startPolling = () => {
      if (pollIntervalRef.current) return;
      
      const poll = async () => {
        if (!isMounted) return;
        
        try {
          const data = await apiService.getPlanningStatus(topicId);
          if (!isMounted) return;
          
          setStatus(data);
          
          if (data.planning_complete) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }
        } catch (err) {
          console.error('Polling error:', err);
        }
      };
      
      poll(); // Immediate first poll
      pollIntervalRef.current = setInterval(poll, 3000);
    };

    startPolling();

    return () => {
      isMounted = false;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
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

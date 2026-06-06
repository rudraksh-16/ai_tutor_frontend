import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  BookOpen, Plus, Activity, CheckCircle, Clock, LogOut,
  Home, PanelLeftClose, PanelLeftOpen, MessageSquare,
  GraduationCap, ChevronRight, Sun, Moon
} from 'lucide-react';
import { apiService } from '../../services/api';
import { authService } from '../../services/auth';
import { useTheme } from '../../hooks/useTheme';
import './Sidebar.css';

const getStatusIcon = (status) => {
  const s = (status || '').toLowerCase();
  if (s === 'completed') return <CheckCircle size={14} className="status-completed" />;
  if (s === 'in_progress' || s === 'processing') return <Activity size={14} className="status-processing" />;
  return <Clock size={14} />;
};

export const Sidebar = ({ refreshKey, onLogout }) => {
  const { theme, toggleTheme } = useTheme();
  const [inProgress, setInProgress] = useState([]);
  const [completed, setCompleted] = useState([]);
  const [loading, setLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const [collapsed, setCollapsed] = useState(window.innerWidth <= 768);
  const [curriculumOpen, setCurriculumOpen] = useState(true);
  const [learningOpen, setLearningOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  const userName = authService.getCurrentUserName();
  const userInitials = userName ? userName.substring(0, 1).toUpperCase() : 'U';

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setCollapsed(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchSidebar = async () => {
      const showLoadingState = !hasLoadedOnceRef.current;
      try {
        if (showLoadingState) setLoading(true);

        const data = await apiService.getSidebar(controller.signal);
        if (controller.signal.aborted) return;

        setInProgress(data.in_progress || []);
        setCompleted(data.completed || []);
      } catch (err) {
        if (err.code !== 'ERR_CANCELED') console.error('Failed to load sidebar', err);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          hasLoadedOnceRef.current = true;
        }
      }
    };

    fetchSidebar();
    return () => controller.abort();
  }, [refreshKey]);

  // A topic should appear under Learning only after planning is complete.
  const curriculumTopics = inProgress.filter((topic) => !topic.planning_complete);
  const learningTopics = inProgress.filter((topic) => Boolean(topic.planning_complete));

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* ── Header ── */}
      <div className="sidebar-header">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
          <BookOpen className="logo-icon" size={24} />
          {!collapsed && <h1 className="text-gradient">AI Tutor</h1>}
        </Link>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            className="sidebar-toggle display-mobile-only"
            onClick={() => setCollapsed(c => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>
      </div>

      {/* ── Home ── */}
      <div className="home-section">
        <button
          className={`home-btn ${location.pathname === '/' ? 'active' : ''}`}
          onClick={() => navigate('/')}
        >
          <Home size={18} />
          {!collapsed && <span>Home</span>}
        </button>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="sidebar-content">
        {loading ? (
          <p className="sidebar-empty-text">Loading...</p>
        ) : (
          <>
            {/* ── Section 1: Curriculum (Pending Topics) ── */}
            <div className="sidebar-section">
              <div className="sidebar-section-header" onClick={() => setCurriculumOpen(o => !o)}>
                <MessageSquare size={16} className="sidebar-section-icon" />
                <span className="sidebar-section-label">Curriculum</span>
                <ChevronRight
                  size={14}
                  className={`sidebar-section-chevron ${curriculumOpen ? 'expanded' : ''}`}
                />
              </div>
              {curriculumOpen && (
                <div className="sidebar-section-items">
                  {curriculumTopics.length === 0 ? (
                    <p className="sidebar-empty-text">No active chats</p>
                  ) : (
                    curriculumTopics.map(topic => {
                      const isActive = location.pathname.includes(`/topic/${topic.id}`);
                      return (
                        <button
                          key={topic.id}
                          className={`topic-item ${isActive ? 'active' : ''}`}
                          onClick={() => navigate(`/topic/${topic.id}/curriculum`)}
                          title={topic.title}
                        >
                          <div className="topic-abbr">{topic.title.charAt(0).toUpperCase()}</div>
                          <div className="topic-title">{topic.title}</div>
                          <div className="topic-status-icon">{getStatusIcon(topic.status)}</div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {/* ── Section 2: Learning (In Progress + Completed Topics) ── */}
            <div className="sidebar-section">
              <div className="sidebar-section-header" onClick={() => setLearningOpen(o => !o)}>
                <GraduationCap size={16} className="sidebar-section-icon" />
                <span className="sidebar-section-label">Learning</span>
                <ChevronRight
                  size={14}
                  className={`sidebar-section-chevron ${learningOpen ? 'expanded' : ''}`}
                />
              </div>
              {learningOpen && (
                <div className="sidebar-section-items">
                  {learningTopics.length === 0 && completed.length === 0 ? (
                    <p className="sidebar-empty-text">No topics yet</p>
                  ) : (
                    <>
                      {learningTopics.map(topic => {
                        const isActive = location.pathname.includes(`/topic/${topic.id}`);
                        return (
                          <button
                            key={topic.id}
                            className={`topic-item ${isActive ? 'active' : ''}`}
                            onClick={() => navigate(`/topic/${topic.id}/learn`)}
                            title={topic.title}
                          >
                            <div className="topic-abbr">{topic.title.charAt(0).toUpperCase()}</div>
                            <div className="topic-title">{topic.title}</div>
                            <div className="topic-status-icon">{getStatusIcon(topic.status)}</div>
                          </button>
                        );
                      })}
                      {completed.map(topic => {
                        const isActive = location.pathname.includes(`/topic/${topic.id}`);
                        return (
                          <button
                            key={topic.id}
                            className={`topic-item ${isActive ? 'active' : ''}`}
                            onClick={() => navigate(`/topic/${topic.id}/learn`)}
                            title={topic.title}
                          >
                            <div className="topic-abbr">{topic.title.charAt(0).toUpperCase()}</div>
                            <div className="topic-title">{topic.title}</div>
                            <div className="topic-status-icon">
                              <CheckCircle size={14} className="status-completed" />
                            </div>
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div className="sidebar-footer">
        <button className="new-topic-btn" onClick={() => navigate('/')}>
          <Plus size={18} />
          {!collapsed && <span>New Topic</span>}
        </button>
        
        <div className="user-profile-section">
          <div className="user-info">
            <div className="user-avatar">{userInitials}</div>
            {!collapsed && <span className="user-name">{userName}</span>}
          </div>
          <button
            className="logout-icon-btn"
            onClick={() => {
              if (window.confirm("Are you sure you want to log out?")) {
                onLogout();
              }
            }}
            title="Logout"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

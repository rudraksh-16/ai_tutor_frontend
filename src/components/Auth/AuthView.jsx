import React, { useState } from 'react';
import { authService } from '../../services/auth';
import { useTheme } from '../../hooks/useTheme';
import { Loader2, LogIn, UserPlus, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import './Auth.css';

export const AuthView = ({ onAuthSuccess }) => {
  const { theme, toggleTheme } = useTheme();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const response = await authService.login(email, password);
        onAuthSuccess(response.user_id);
      } else {
        await authService.register(name, email, password);
        const response = await authService.login(email, password);
        onAuthSuccess(response.user_id);
      }
    } catch (err) {
      if (err.response?.data?.detail) {
        setError(Array.isArray(err.response.data.detail) 
          ? err.response.data.detail[0].msg 
          : err.response.data.detail
        );
      } else {
        setError(err.message || 'An unexpected error occurred');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <button className="theme-toggle auth-theme-toggle" onClick={toggleTheme} title="Toggle theme">
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>

      <div className="auth-card glass">
        <div className="auth-header">
          <h1 className="text-gradient">AI Tutor</h1>
          <p>{isLogin ? 'Welcome back! Please login to continue.' : 'Create a new account to get started.'}</p>
        </div>

        {error && (
          <div className="auth-error">
            {error}
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="input-group">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                className="auth-input"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="input-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="password-wrapper">
              <input
                id="password"
                className="auth-input"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(prev => !prev)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {!isLogin && (
              <span className="password-hint">
                Must be 6+ chars with uppercase, lowercase, number, and special character.
              </span>
            )}
          </div>

          <button type="submit" className="auth-btn" disabled={loading || !email || !password || (!isLogin && !name)}>
            {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? <LogIn size={20} /> : <UserPlus size={20} />)}
            {isLogin ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <div className="auth-toggle">
          {isLogin ? "Don't have an account?" : 'Already have an account?'}
          <button 
            type="button" 
            className="auth-toggle-btn"
            onClick={() => {
              setIsLogin(!isLogin);
              setError(null);
            }}
          >
            {isLogin ? 'Sign up' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};

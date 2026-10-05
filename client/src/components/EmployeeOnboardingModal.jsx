import React, { useEffect, useState } from 'react';
import { 
  Sparkles, 
  CheckCircle2, 
  MessageSquare, 
  LayoutDashboard, 
  ShieldCheck, 
  ArrowRight, 
  X, 
  Check, 
  Zap,
  BookOpen,
  Award
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useAuth } from '../context/AuthContext';
import { soundManager } from '../utils/sound';

export default function EmployeeOnboardingModal({ 
  isOpen, 
  onClose, 
  onNavigateToDashboard, 
  onNavigateToChat 
}) {
  const { user, token } = useAuth();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      soundManager.playMessageReceived();
      
      // Fire festive multi-burst confetti
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.5 }
      });

      const timer = setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 }
        });
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 }
        });
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const markOnboardingComplete = async () => {
    if (user?.id) {
      try {
        localStorage.setItem(`QuantumPropAI_onboarding_seen_${user.id}`, 'true');
        if (token) {
          fetch('/api/users/onboarding-complete', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` }
          }).catch(err => console.error('Failed to update onboarding status in db:', err));
        }
      } catch (e) {
        console.error(e);
      }
    }
  };

  const handleGoToDashboard = async () => {
    await markOnboardingComplete();
    onClose();
    if (onNavigateToDashboard) onNavigateToDashboard();
  };

  const handleGoToChat = async () => {
    await markOnboardingComplete();
    onClose();
    if (onNavigateToChat) onNavigateToChat();
  };

  const handleDismiss = async () => {
    await markOnboardingComplete();
    onClose();
  };

  return (
    <div className="modal-overlay onboarding-overlay" style={{ zIndex: 500 }}>
      <div 
        className="modal-dialog onboarding-dialog" 
      >
        {/* Close Button */}
        <button 
          className="modal-close-btn onboarding-close" 
          onClick={handleDismiss}
          title="Dismiss Welcome Guide"
        >
          <X size={20} />
        </button>

        {/* Hero Celebration Banner */}
        <div className="onboarding-hero">
          <div className="onboarding-badge">
            <Sparkles size={15} color="#fbbf24" />
            <span>WELCOME TO QuantumPropAI</span>
          </div>

          <h2 className="onboarding-title">
            Congratulations, {user?.displayName || user?.username}! 🎉
          </h2>

          <p className="onboarding-subtitle">
            Your employee workspace is activated and ready. You are now officially part of the team!
          </p>
        </div>

        {/* Employee Profile Pill Card */}
        <div className="onboarding-profile-card">
          <div className="avatar-wrapper" style={{ width: 52, height: 52 }}>
            <img src={user?.avatar} alt={user?.displayName} className="avatar-img" />
            <span className="status-dot online" />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: '1.05rem', color: '#fff' }}>
                {user?.displayName || user?.username}
              </span>
              <span className="employee-role-pill" style={{ fontSize: '0.74rem' }}>
                {user?.role || 'Team Member'}
              </span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
              @{user?.username} • Account Active
            </div>
          </div>

          <div className="admin-connection-indicator" title="Connected directly with Admin">
            <ShieldCheck size={15} color="#fbbf24" />
            <span>Admin Linked</span>
          </div>
        </div>

        {/* 3 Core Workspace Tour Steps */}
        <div className="onboarding-features-list">
          {/* Step 1: Direct Messenger */}
          <div className="onboarding-feature-item">
            <div className="feature-icon-wrapper chat">
              <MessageSquare size={20} color="#6366f1" />
            </div>
            <div className="feature-content">
              <div className="feature-title">
                1. Dedicated Direct Line with Admin
              </div>
              <div className="feature-desc">
                You have a direct, private channel with the Administrator. Send text messages, ask questions, or exchange PDF documents anytime.
              </div>
            </div>
          </div>

          {/* Step 2: Review Dashboard */}
          <div className="onboarding-feature-item">
            <div className="feature-icon-wrapper dashboard">
              <LayoutDashboard size={20} color="#10b981" />
            </div>
            <div className="feature-content">
              <div className="feature-title">
                2. Evaluation & Survey Dashboard 📊
              </div>
              <div className="feature-desc">
                Review assigned tasks and items, submit survey responses, and contribute constructive feedback.
              </div>
            </div>
          </div>

          {/* Step 3: Guidelines & Knowledge Base */}
          <div className="onboarding-feature-item">
            <div className="feature-icon-wrapper guidelines">
              <BookOpen size={20} color="#f59e0b" />
            </div>
            <div className="feature-content">
              <div className="feature-title">
                3. Company Directives & Quality Standards 📌
              </div>
              <div className="feature-desc">
                Access official operating procedures, guidelines, and quality standards, and acknowledge important directives posted by the Admin.
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="onboarding-actions-group">
          <button
            type="button"
            className="onboarding-primary-btn"
            onClick={handleGoToDashboard}
          >
            <LayoutDashboard size={17} />
            <span>Explore Review Dashboard</span>
            <ArrowRight size={16} />
          </button>

          <button
            type="button"
            className="onboarding-secondary-btn"
            onClick={handleGoToChat}
          >
            <MessageSquare size={16} />
            <span>Chat with Admin</span>
          </button>
        </div>

        {/* Bottom Note */}
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            type="button"
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-dim)',
              fontSize: '0.78rem',
              cursor: 'pointer',
              textDecoration: 'underline'
            }}
          >
            I'm ready, close this guide
          </button>
        </div>
      </div>
    </div>
  );
}

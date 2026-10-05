import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sliders, 
  Sparkles, 
  Check, 
  Loader2, 
  HelpCircle, 
  TrendingUp, 
  RotateCcw,
  Layers,
  Zap,
  Play,
  Pause,
  Square,
  Radio,
  Clock,
  Flame,
  Activity
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';

export default function DataMixerModal({
  isOpen,
  onClose,
  item,
  onItemUpdated
}) {
  const { token } = useAuth();
  const { socket } = useSocket();

  // Active tab: 'streamer' (Real-time live drip) vs 'manual' (Static custom numbers)
  const [activeTab, setActiveTab] = useState('streamer');

  // Manual Mixer State
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('add');
  const [goodCount, setGoodCount] = useState(0);
  const [badCount, setBadCount] = useState(0);
  const [questionBoosts, setQuestionBoosts] = useState({});

  // Real-Time Drip Streamer State
  const [targetVotes, setTargetVotes] = useState(2000);
  const [yesRatio, setYesRatio] = useState(85);
  const [pacePreset, setPacePreset] = useState('natural'); // 'natural' | 'fast' | 'rush' | 'custom'
  const [minIntervalSec, setMinIntervalSec] = useState(2);
  const [maxIntervalSec, setMaxIntervalSec] = useState(6);
  const [minBatch, setMinBatch] = useState(1);
  const [maxBatch, setMaxBatch] = useState(4);

  const [loading, setLoading] = useState(false);
  const [dripLoading, setDripLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Initialize state from item
  useEffect(() => {
    if (!item) return;

    const existingMixer = item.dataMixer || {};
    setEnabled(!!existingMixer.enabled);
    setMode(existingMixer.mode === 'override' ? 'override' : 'add');
    setGoodCount(existingMixer.goodCount || 0);
    setBadCount(existingMixer.badCount || 0);
    setQuestionBoosts(existingMixer.questionBoosts ? { ...existingMixer.questionBoosts } : {});

    const existingCampaign = item.dripCampaign;
    if (existingCampaign) {
      setTargetVotes(existingCampaign.targetVotes || 2000);
      setYesRatio(existingCampaign.yesRatio !== undefined ? existingCampaign.yesRatio : 85);
      setMinIntervalSec(existingCampaign.minIntervalSec || 2);
      setMaxIntervalSec(existingCampaign.maxIntervalSec || 6);
      setMinBatch(existingCampaign.minBatch || 1);
      setMaxBatch(existingCampaign.maxBatch || 4);
    }

    setSuccess(false);
    setError('');
  }, [item, isOpen]);

  // Pace preset handler
  const handleSelectPace = (type) => {
    setPacePreset(type);
    if (type === 'natural') {
      setMinIntervalSec(3);
      setMaxIntervalSec(7);
      setMinBatch(1);
      setMaxBatch(3);
    } else if (type === 'fast') {
      setMinIntervalSec(1.5);
      setMaxIntervalSec(3.5);
      setMinBatch(2);
      setMaxBatch(6);
    } else if (type === 'rush') {
      setMinIntervalSec(0.8);
      setMaxIntervalSec(2);
      setMinBatch(4);
      setMaxBatch(14);
    }
  };

  if (!isOpen || !item) return null;

  const questions = item.questions || [];
  const hasVerdict = !questions.length || questions.some(q => q.type === 'verdict');
  const campaign = item.dripCampaign;
  const isDripRunning = campaign?.status === 'running';
  const isDripPaused = campaign?.status === 'paused';
  const isDripCompleted = campaign?.status === 'completed';
  const currentStreamed = campaign?.currentStreamed || 0;
  const currentGoal = campaign?.targetVotes || targetVotes;
  const progressPct = currentGoal > 0 ? Math.min(100, Math.round((currentStreamed / currentGoal) * 100)) : 0;

  // Real-time Drip API Actions
  const handleStartDrip = async (resetStreamed = false) => {
    setDripLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/items/${item.id}/drip/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          targetVotes: Number(targetVotes) || 2000,
          yesRatio: Number(yesRatio) || 85,
          minIntervalSec: Number(minIntervalSec) || 2,
          maxIntervalSec: Number(maxIntervalSec) || 6,
          minBatch: Number(minBatch) || 1,
          maxBatch: Number(maxBatch) || 4,
          resetStreamed
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start live drip stream');

      if (onItemUpdated) {
        onItemUpdated(data.item);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setDripLoading(false);
    }
  };

  const handlePauseDrip = async () => {
    setDripLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/items/${item.id}/drip/pause`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to pause stream');
      if (onItemUpdated) onItemUpdated(data.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setDripLoading(false);
    }
  };

  const handleStopDrip = async (resetNumbers = false) => {
    setDripLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/items/${item.id}/drip/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ resetNumbers })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to stop stream');
      if (onItemUpdated) onItemUpdated(data.item);
    } catch (err) {
      setError(err.message);
    } finally {
      setDripLoading(false);
    }
  };

  // Manual Mixer Save
  const handleSaveManual = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError('');

    const payload = {
      dataMixer: {
        enabled,
        mode,
        goodCount: Number(goodCount) || 0,
        badCount: Number(badCount) || 0,
        questionBoosts
      }
    };

    try {
      const res = await fetch(`/api/dashboard/items/${item.id}/data-mixer`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update data mixer');

      setSuccess(true);
      if (onItemUpdated) onItemUpdated(data.item);

      setTimeout(() => {
        onClose();
      }, 600);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetQBoost = (qId, field, value) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setQuestionBoosts(prev => ({
      ...prev,
      [qId]: {
        ...(prev[qId] || {}),
        [field]: num
      }
    }));
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 450 }}>
      <div 
        className="modal-dialog" 
        style={{ 
          maxWidth: 680, 
          width: '94vw', 
          maxHeight: '92vh', 
          overflowY: 'auto',
          background: 'rgba(15, 20, 32, 0.98)',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6), 0 0 30px rgba(99, 102, 241, 0.15)',
          padding: '24px 28px'
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.4)'
            }}>
              <Activity size={22} color="#fff" />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                Response Data Mixer & Live Streamer
                {isDripRunning && (
                  <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    padding: '2px 8px',
                    borderRadius: 6,
                    background: 'rgba(16, 185, 129, 0.25)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#34d399', display: 'inline-block', boxShadow: '0 0 8px #34d399' }} />
                    Streaming Live
                  </span>
                )}
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                Simulate realistic traffic and custom response counts for "{item.title}"
              </p>
            </div>
          </div>

          <button 
            type="button"
            className="modal-close-btn" 
            onClick={onClose}
            style={{ marginTop: -4 }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 8, background: 'rgba(255, 255, 255, 0.04)', padding: 4, borderRadius: 10, marginBottom: 18 }}>
          <button
            type="button"
            onClick={() => setActiveTab('streamer')}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'streamer' ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'transparent',
              color: activeTab === 'streamer' ? '#fff' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: activeTab === 'streamer' ? '0 2px 10px rgba(99, 102, 241, 0.35)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Zap size={16} />
            <span>⚡ Live Real-Time Streamer</span>
            {isDripRunning && (
              <span style={{ fontSize: '0.7rem', background: '#10b981', color: '#fff', padding: '1px 6px', borderRadius: 10 }}>
                Active
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            style={{
              flex: 1,
              padding: '9px 14px',
              borderRadius: 8,
              border: 'none',
              background: activeTab === 'manual' ? 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)' : 'transparent',
              color: activeTab === 'manual' ? '#fff' : 'var(--text-muted)',
              fontWeight: 700,
              fontSize: '0.84rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: activeTab === 'manual' ? '0 2px 10px rgba(99, 102, 241, 0.35)' : 'none',
              transition: 'all 0.15s ease'
            }}
          >
            <Sliders size={16} />
            <span>🎛️ Static Custom Numbers</span>
          </button>
        </div>

        {error && <div className="form-error" style={{ marginBottom: 16 }}>{error}</div>}

        {/* TAB 1: LIVE REAL-TIME STREAMER */}
        {activeTab === 'streamer' && (
          <div>
            {/* Live Campaign Status Banner */}
            <div style={{
              background: isDripRunning 
                ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.16) 0%, rgba(99, 102, 241, 0.12) 100%)'
                : isDripPaused
                  ? 'rgba(245, 158, 11, 0.12)'
                  : isDripCompleted
                    ? 'rgba(16, 185, 129, 0.14)'
                    : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${
                isDripRunning 
                  ? 'rgba(16, 185, 129, 0.45)' 
                  : isDripPaused 
                    ? 'rgba(245, 158, 11, 0.4)' 
                    : isDripCompleted
                      ? 'rgba(16, 185, 129, 0.4)'
                      : 'rgba(255, 255, 255, 0.08)'
              }`,
              borderRadius: 14,
              padding: '16px 20px',
              marginBottom: 20
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 9,
                      height: 9,
                      borderRadius: '50%',
                      background: isDripRunning ? '#10b981' : isDripPaused ? '#fbbf24' : isDripCompleted ? '#34d399' : '#64748b',
                      boxShadow: isDripRunning ? '0 0 10px #10b981' : 'none'
                    }} />
                    <span style={{ fontWeight: 800, fontSize: '0.95rem', color: '#fff' }}>
                      {isDripRunning 
                        ? 'Live Stream Running in Real-Time' 
                        : isDripPaused 
                          ? 'Live Stream Paused' 
                          : isDripCompleted 
                            ? 'Goal Achieved! Stream Completed' 
                            : 'Live Stream Inactive'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: 3 }}>
                    {isDripRunning 
                      ? 'Votes are being dripped at randomized intervals in the background and broadcast to all users.'
                      : isDripPaused
                        ? 'Stream paused. You can resume at any time or reset.'
                        : isDripCompleted
                          ? `Delivered all ${campaign?.targetVotes || targetVotes} votes successfully.`
                          : 'Set your target (e.g. 2,000 votes) and launch real-time influx.'}
                  </div>
                </div>

                {/* Stream Controls */}
                <div style={{ display: 'flex', gap: 8 }}>
                  {isDripRunning ? (
                    <>
                      <button
                        type="button"
                        onClick={handlePauseDrip}
                        disabled={dripLoading}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 8,
                          background: 'rgba(245, 158, 11, 0.2)',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          color: '#fbbf24',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6
                        }}
                      >
                        <Pause size={14} />
                        <span>Pause</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStopDrip(false)}
                        disabled={dripLoading}
                        style={{
                          padding: '7px 12px',
                          borderRadius: 8,
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          color: '#f87171',
                          fontWeight: 600,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5
                        }}
                        title="Stop streamer and keep current accumulated votes"
                      >
                        <Square size={13} />
                        <span>Stop</span>
                      </button>
                    </>
                  ) : isDripPaused ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleStartDrip(false)}
                        disabled={dripLoading}
                        style={{
                          padding: '7px 14px',
                          borderRadius: 8,
                          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                          border: 'none',
                          color: '#fff',
                          fontWeight: 700,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)'
                        }}
                      >
                        <Play size={14} />
                        <span>Resume</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStopDrip(true)}
                        disabled={dripLoading}
                        style={{
                          padding: '7px 12px',
                          borderRadius: 8,
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.35)',
                          color: '#f87171',
                          fontWeight: 600,
                          fontSize: '0.78rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 5
                        }}
                        title="Reset stream count back to zero"
                      >
                        <RotateCcw size={13} />
                        <span>Reset</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </div>

              {/* Progress Bar & Live Stream Stats */}
              {(isDripRunning || isDripPaused || isDripCompleted || currentStreamed > 0) && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.78rem', marginBottom: 6 }}>
                    <span style={{ color: '#34d399', fontWeight: 700 }}>
                      Streamed: {currentStreamed.toLocaleString()} / {currentGoal.toLocaleString()} votes
                    </span>
                    <span style={{ color: '#a5b4fc', fontWeight: 700 }}>
                      {progressPct}% Completed
                    </span>
                  </div>

                  <div className="progress-track" style={{ height: 8, borderRadius: 6, background: 'rgba(0, 0, 0, 0.4)' }}>
                    <div 
                      style={{ 
                        width: `${progressPct}%`, 
                        height: '100%', 
                        borderRadius: 6,
                        background: 'linear-gradient(90deg, #10b981 0%, #6366f1 50%, #a855f7 100%)',
                        boxShadow: '0 0 12px rgba(99, 102, 241, 0.6)',
                        transition: 'width 0.3s ease'
                      }} 
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Campaign Setup Form (When inactive, paused, or adjusting parameters) */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: 14,
              padding: '18px 20px',
              marginBottom: 16
            }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#fff', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Clock size={16} color="#60a5fa" />
                <span>Configure Live Vote Stream Parameters</span>
              </div>

              {/* 1. Target Votes Goal */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.78rem', color: '#93c5fd', fontWeight: 600 }}>
                    🎯 Target Total Votes Goal:
                  </label>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[500, 1000, 2000, 5000].map(cnt => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setTargetVotes(cnt)}
                        style={{
                          fontSize: '0.7rem',
                          padding: '3px 8px',
                          borderRadius: 6,
                          background: targetVotes === cnt ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${targetVotes === cnt ? '#818cf8' : 'rgba(255, 255, 255, 0.1)'}`,
                          color: targetVotes === cnt ? '#fff' : 'var(--text-muted)',
                          cursor: 'pointer'
                        }}
                      >
                        {cnt.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="number"
                  min="1"
                  className="form-input"
                  value={targetVotes}
                  onChange={(e) => setTargetVotes(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  style={{ width: '100%', fontSize: '0.92rem', padding: '9px 12px' }}
                  placeholder="e.g. 2000"
                />
              </div>

              {/* 2. Yes / Positive Ratio */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: 600 }}>
                    Distribution Ratio ({yesRatio}% Yes / Good • {100 - yesRatio}% No / Bad)
                  </label>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {[70, 85, 92].map(r => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setYesRatio(r)}
                        style={{
                          fontSize: '0.7rem',
                          padding: '2px 7px',
                          borderRadius: 5,
                          background: yesRatio === r ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                          border: `1px solid ${yesRatio === r ? '#34d399' : 'rgba(255, 255, 255, 0.1)'}`,
                          color: yesRatio === r ? '#34d399' : 'var(--text-muted)',
                          cursor: 'pointer'
                        }}
                      >
                        {r}% Yes
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <input
                    type="range"
                    min="1"
                    max="99"
                    value={yesRatio}
                    onChange={(e) => setYesRatio(parseInt(e.target.value, 10))}
                    style={{ flex: 1, accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#34d399', minWidth: 44 }}>
                    {yesRatio}%
                  </span>
                </div>
              </div>

              {/* 3. Traffic Pace & Randomized Timing Interval */}
              <div>
                <label style={{ fontSize: '0.78rem', color: '#c084fc', fontWeight: 600, display: 'block', marginBottom: 8 }}>
                  ⏱️ Realism Pace & Random Timing Interval:
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
                  <button
                    type="button"
                    onClick={() => handleSelectPace('natural')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      textAlign: 'left',
                      background: pacePreset === 'natural' ? 'rgba(99, 102, 241, 0.22)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${pacePreset === 'natural' ? '#818cf8' : 'rgba(255, 255, 255, 0.08)'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: pacePreset === 'natural' ? '#fff' : 'var(--text-muted)' }}>
                      🍃 Realistic Trickle
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>
                      Random 3 to 7s • 1-3 votes per tick
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPace('fast')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      textAlign: 'left',
                      background: pacePreset === 'fast' ? 'rgba(99, 102, 241, 0.22)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${pacePreset === 'fast' ? '#818cf8' : 'rgba(255, 255, 255, 0.08)'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: pacePreset === 'fast' ? '#fff' : 'var(--text-muted)' }}>
                      ⚡ Active Influx
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>
                      Random 1.5 to 3.5s • 2-6 votes per tick
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSelectPace('rush')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      textAlign: 'left',
                      background: pacePreset === 'rush' ? 'rgba(99, 102, 241, 0.22)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${pacePreset === 'rush' ? '#818cf8' : 'rgba(255, 255, 255, 0.08)'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: pacePreset === 'rush' ? '#fff' : 'var(--text-muted)' }}>
                      🔥 High Rush
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>
                      Random 0.8 to 2s • 4-14 votes per tick
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPacePreset('custom')}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 10,
                      textAlign: 'left',
                      background: pacePreset === 'custom' ? 'rgba(99, 102, 241, 0.22)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${pacePreset === 'custom' ? '#818cf8' : 'rgba(255, 255, 255, 0.08)'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.82rem', color: pacePreset === 'custom' ? '#fff' : 'var(--text-muted)' }}>
                      ⚙️ Custom Intervals
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>
                      Specify custom seconds & batch sizes
                    </div>
                  </button>
                </div>

                {/* Custom interval fields if selected */}
                {pacePreset === 'custom' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 12, background: 'rgba(0,0,0,0.3)', borderRadius: 10 }}>
                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                        Random Interval (Seconds Range):
                      </label>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="number"
                          step="0.5"
                          min="0.5"
                          value={minIntervalSec}
                          onChange={(e) => setMinIntervalSec(parseFloat(e.target.value) || 1)}
                          style={{ width: 60, padding: '5px 8px', fontSize: '0.8rem', borderRadius: 6, background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
                        />
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>to</span>
                        <input
                          type="number"
                          step="0.5"
                          min="1"
                          value={maxIntervalSec}
                          onChange={(e) => setMaxIntervalSec(parseFloat(e.target.value) || 2)}
                          style={{ width: 60, padding: '5px 8px', fontSize: '0.8rem', borderRadius: 6, background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
                        />
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>sec</span>
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: '0.72rem', color: 'var(--text-dim)', display: 'block', marginBottom: 4 }}>
                        Random Batch (Votes Per Tick):
                      </label>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input
                          type="number"
                          min="1"
                          value={minBatch}
                          onChange={(e) => setMinBatch(parseInt(e.target.value, 10) || 1)}
                          style={{ width: 60, padding: '5px 8px', fontSize: '0.8rem', borderRadius: 6, background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
                        />
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>to</span>
                        <input
                          type="number"
                          min="1"
                          value={maxBatch}
                          onChange={(e) => setMaxBatch(parseInt(e.target.value, 10) || 2)}
                          style={{ width: 60, padding: '5px 8px', fontSize: '0.8rem', borderRadius: 6, background: '#1e293b', border: '1px solid #334155', color: '#fff' }}
                        />
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-dim)' }}>votes</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Launch / Action Row */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button
                type="button"
                className="tab-btn"
                onClick={onClose}
                style={{ padding: '9px 18px', fontSize: '0.85rem' }}
              >
                Close
              </button>

              <button
                type="button"
                onClick={() => handleStartDrip(isDripCompleted)}
                disabled={dripLoading}
                className="auth-submit-btn"
                style={{
                  padding: '10px 24px',
                  fontSize: '0.88rem',
                  width: 'auto',
                  margin: 0,
                  background: isDripRunning 
                    ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' 
                    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)'
                }}
              >
                {dripLoading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Loader2 size={16} className="animate-spin" /> Working...
                  </span>
                ) : isDripRunning ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Zap size={16} /> Update Stream Settings
                  </span>
                ) : isDripPaused ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Play size={16} /> Resume Stream ({targetVotes.toLocaleString()} Votes)
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Play size={16} /> 🚀 Launch Real-Time Stream ({targetVotes.toLocaleString()} Votes)
                  </span>
                )}
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: MANUAL STATIC MIXER */}
        {activeTab === 'manual' && (
          <form onSubmit={handleSaveManual}>
            {/* Master Enable Card */}
            <div style={{
              background: enabled ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.03)',
              border: `1px solid ${enabled ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.08)'}`,
              borderRadius: 12,
              padding: '14px 16px',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 34,
                  height: 34,
                  borderRadius: 8,
                  background: enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  <Zap size={18} color={enabled ? '#34d399' : '#94a3b8'} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>
                    Enable Static Mixed Data
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Display fixed customized vote counts across the dashboard cards.
                  </div>
                </div>
              </div>

              <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer', margin: 0 }}>
                <input 
                  type="checkbox" 
                  checked={enabled} 
                  onChange={(e) => setEnabled(e.target.checked)}
                  style={{ opacity: 0, width: 0, height: 0 }} 
                />
                <span style={{
                  position: 'absolute',
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: enabled ? '#10b981' : 'rgba(255, 255, 255, 0.18)',
                  borderRadius: 24,
                  transition: '0.2s',
                  boxShadow: enabled ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'none'
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '""',
                    height: 18,
                    width: 18,
                    left: enabled ? 22 : 3,
                    bottom: 3,
                    backgroundColor: '#fff',
                    borderRadius: '50%',
                    transition: '0.2s'
                  }} />
                </span>
              </label>
            </div>

            {/* Mode Selection */}
            {enabled && (
              <div style={{ marginBottom: 18 }}>
                <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: 0.5, color: '#93c5fd', fontWeight: 700, display: 'block', marginBottom: 8 }}>
                  Calculation Mode
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => setMode('add')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      textAlign: 'left',
                      background: mode === 'add' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${mode === 'add' ? 'rgba(99, 102, 241, 0.6)' : 'rgba(255, 255, 255, 0.08)'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: mode === 'add' ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Layers size={15} color={mode === 'add' ? '#818cf8' : '#94a3b8'} />
                      <span>Blend With Real Votes</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 3 }}>
                      Simulated counts add on top of actual votes.
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setMode('override')}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      textAlign: 'left',
                      background: mode === 'override' ? 'rgba(168, 85, 247, 0.2)' : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${mode === 'override' ? 'rgba(168, 85, 247, 0.6)' : 'rgba(255, 255, 255, 0.08)'}`,
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.84rem', color: mode === 'override' ? '#fff' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <TrendingUp size={15} color={mode === 'override' ? '#c084fc' : '#94a3b8'} />
                      <span>Direct Override</span>
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 3 }}>
                      Displays specified numbers directly.
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Verdict Settings (Good / Bad) */}
            {hasVerdict && (
              <div style={{
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.07)',
                borderRadius: 12,
                padding: '16px',
                marginBottom: 16
              }}>
                <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fff', display: 'block', marginBottom: 10 }}>
                  Overall Verdict (Good vs Bad)
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={{ fontSize: '0.76rem', color: '#34d399', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                      👍 Good Votes
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={goodCount}
                      onChange={(e) => setGoodCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      style={{ width: '100%', fontSize: '0.9rem', padding: '8px 12px' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.76rem', color: '#f87171', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                      👎 Bad Votes
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      value={badCount}
                      onChange={(e) => setBadCount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      style={{ width: '100%', fontSize: '0.9rem', padding: '8px 12px' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Questions (Yes / No, etc.) */}
            {questions.map((q, idx) => {
              const isYesNo = q.type === 'yes_no' || q.type === 'two_options' || q.type === 'boolean';
              const opt1Label = q.options?.[0] || 'Yes';
              const opt2Label = q.options?.[1] || 'No';
              const currentQBoost = questionBoosts[q.id] || {};
              const opt1Val = currentQBoost.opt1Count !== undefined ? currentQBoost.opt1Count : 0;
              const opt2Val = currentQBoost.opt2Count !== undefined ? currentQBoost.opt2Count : 0;

              return (
                <div 
                  key={q.id || idx}
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: 12,
                    padding: '16px',
                    marginBottom: 16
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 800,
                      color: 'var(--accent-cyan)',
                      background: 'rgba(99, 102, 241, 0.2)',
                      padding: '2px 6px',
                      borderRadius: 5
                    }}>
                      Q{idx + 1}
                    </span>
                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: '#fff' }}>
                      {q.text}
                    </span>
                  </div>

                  {isYesNo && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <label style={{ fontSize: '0.76rem', color: '#34d399', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                          ✓ Simulated "{opt1Label}" Count
                        </label>
                        <input
                          type="number"
                          min="0"
                          className="form-input"
                          value={opt1Val}
                          onChange={(e) => handleSetQBoost(q.id, 'opt1Count', e.target.value)}
                          style={{ width: '100%', fontSize: '0.9rem', padding: '8px 12px' }}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '0.76rem', color: '#f87171', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                          ✕ Simulated "{opt2Label}" Count
                        </label>
                        <input
                          type="number"
                          min="0"
                          className="form-input"
                          value={opt2Val}
                          onChange={(e) => handleSetQBoost(q.id, 'opt2Count', e.target.value)}
                          style={{ width: '100%', fontSize: '0.9rem', padding: '8px 12px' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Action Row */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button
                type="button"
                className="tab-btn"
                onClick={onClose}
                style={{ padding: '9px 18px', fontSize: '0.85rem' }}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={loading}
                style={{ padding: '9px 24px', fontSize: '0.85rem', width: 'auto', margin: 0 }}
              >
                {loading ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Loader2 size={16} className="animate-spin" /> Saving...
                  </span>
                ) : success ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#34d399' }}>
                    <Check size={16} /> Saved!
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={15} /> Apply Static Numbers
                  </span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { 
  X, 
  RotateCcw, 
  Calendar, 
  ShieldCheck, 
  Pin, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  Archive, 
  FileText,
  HelpCircle,
  Clock,
  Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function MonthEndResetModal({ isOpen, onClose, onResetSuccess }) {
  const { token } = useAuth();

  const [loadingPreview, setLoadingPreview] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [successResult, setSuccessResult] = useState(null);

  const [previewData, setPreviewData] = useState({
    totalActiveItems: 0,
    completedItemsCount: 0,
    pendingItemsCount: 0,
    totalActiveInstructions: 0,
    unpinnedInstructionsCount: 0,
    pinnedInstructionsCount: 0
  });

  // Options
  const [resetCompletedOnly, setResetCompletedOnly] = useState(true);
  const [resetAllItems, setResetAllItems] = useState(false);
  const [resetUnpinnedInstructions, setResetUnpinnedInstructions] = useState(true);

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

  // Fetch preview counts when modal opens
  useEffect(() => {
    if (!isOpen || !token) return;
    setLoadingPreview(true);
    setError('');
    setSuccessResult(null);

    fetch('/api/dashboard/admin/month-end-preview', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(async res => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Failed to load cleanup preview');
        return data;
      })
      .then(data => {
        setPreviewData(data);
      })
      .catch(err => {
        console.error('Month-end preview error:', err);
        setError(err.message || 'Could not load current workspace counts. You can still proceed.');
      })
      .finally(() => {
        setLoadingPreview(false);
      });
  }, [isOpen, token]);

  if (!isOpen) return null;

  const handleConfirmReset = async () => {
    setSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/dashboard/admin/month-end-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          resetCompletedOnly: resetAllItems ? false : resetCompletedOnly,
          resetAllItems,
          resetUnpinnedInstructions
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to execute month-end reset');
      }

      setSuccessResult(data);
      if (onResetSuccess) {
        onResetSuccess(data);
      }
      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err) {
      console.error('Month-end reset error:', err);
      setError(err.message || 'An unexpected error occurred during reset.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div 
      className="modal-backdrop" 
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(5, 8, 20, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20
      }}
    >
      <div 
        className="modal-content-glass"
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'linear-gradient(145deg, #111827 0%, #0d121f 100%)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 20,
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6), 0 0 40px rgba(99, 102, 241, 0.12)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'fadeInScale 0.22s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        {/* Modal Header */}
        <div style={{
          padding: '24px 28px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'linear-gradient(90deg, rgba(99, 102, 241, 0.12) 0%, rgba(245, 158, 11, 0.08) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'relative'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
              color: '#fff'
            }}>
              <Calendar size={22} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>
                End-of-Month Reset & Cleanup
              </h3>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Clean up active workspace items while preserving all questionnaire history & stats
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: 10,
              width: 34,
              height: 34,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.18s'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {error && (
            <div style={{
              padding: '12px 16px',
              borderRadius: 12,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}>
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{error}</span>
            </div>
          )}

          {successResult && (
            <div style={{
              padding: '14px 18px',
              borderRadius: 12,
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.35)',
              color: '#6ee7b7',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: 10
            }}>
              <CheckCircle2 size={20} color="#10b981" />
              <span>
                <strong>Reset Successful!</strong> Archived {successResult.archivedItemsCount} items and {successResult.archivedInstructionsCount} unpinned directives. All stats remain intact!
              </span>
            </div>
          )}

          {/* Zero Data Loss Guarantee Banner */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(6, 78, 59, 0.2) 100%)',
            border: '1px solid rgba(16, 185, 129, 0.25)',
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 12
          }}>
            <ShieldCheck size={22} color="#10b981" style={{ marginTop: 2, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 700, color: '#6ee7b7' }}>
                Zero Data Loss Guarantee
              </div>
              <div style={{ fontSize: '0.79rem', color: '#a7f3d0', marginTop: 3, lineHeight: 1.45 }}>
                All <strong>Questionnaire Response History</strong>, employee submissions, quiz accuracy scores, leaderboard rankings, and performance audits in the <strong>Statistics</strong> tab will remain 100% intact and unaffected.
              </div>
            </div>
          </div>

          {/* Live Preview Metric Tiles */}
          <div>
            <div style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
              Active Workspace Impact Preview
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {/* Completed items to archive */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                padding: '14px 16px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Completed Items
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#6366f1', marginTop: 4 }}>
                  {loadingPreview ? '...' : (resetAllItems ? previewData.totalActiveItems : previewData.completedItemsCount)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
                  Will be archived
                </div>
              </div>

              {/* Unpinned instructions to clear */}
              <div style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                padding: '14px 16px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                  Unpinned Directives
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b', marginTop: 4 }}>
                  {loadingPreview ? '...' : (resetUnpinnedInstructions ? previewData.unpinnedInstructionsCount : 0)}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: 2 }}>
                  Will be cleared
                </div>
              </div>

              {/* Pinned instructions protected */}
              <div style={{
                background: 'rgba(245, 158, 11, 0.07)',
                border: '1px solid rgba(245, 158, 11, 0.22)',
                borderRadius: 12,
                padding: '14px 16px',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.75rem', color: '#fbbf24', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Pin size={12} /> Pinned Directives
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fbbf24', marginTop: 4 }}>
                  {loadingPreview ? '...' : previewData.pinnedInstructionsCount}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#fde68a', marginTop: 2 }}>
                  Kept active & safe
                </div>
              </div>
            </div>
          </div>

          {/* Cleanup Options Selection */}
          <div style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: 14,
            padding: '16px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14
          }}>
            {/* Option 1: Archive completed review items */}
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
              cursor: resetAllItems ? 'not-allowed' : 'pointer',
              opacity: resetAllItems ? 0.5 : 1
            }}>
              <input
                type="checkbox"
                checked={resetCompletedOnly}
                disabled={resetAllItems}
                onChange={(e) => setResetCompletedOnly(e.target.checked)}
                style={{ marginTop: 3, accentColor: '#6366f1', width: 16, height: 16 }}
              />
              <div>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
                  Archive completed review items
                </span>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Hides cards that already have employee evaluations/responses from the active dashboard grid so it doesn't take up space.
                </p>
              </div>
            </label>

            {/* Option 2: Archive all items (even pending) */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={resetAllItems}
                onChange={(e) => {
                  setResetAllItems(e.target.checked);
                  if (e.target.checked) setResetCompletedOnly(false);
                  else setResetCompletedOnly(true);
                }}
                style={{ marginTop: 3, accentColor: '#6366f1', width: 16, height: 16 }}
              />
              <div>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
                  Archive all active review items (Fresh monthly cycle)
                </span>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Archives all current items (even if pending) for a completely clean slate for the new month.
                </p>
              </div>
            </label>

            {/* Option 3: Clear unpinned directives */}
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={resetUnpinnedInstructions}
                onChange={(e) => setResetUnpinnedInstructions(e.target.checked)}
                style={{ marginTop: 3, accentColor: '#f59e0b', width: 16, height: 16 }}
              />
              <div>
                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#ffffff' }}>
                  Reset unpinned important instructions & directives
                </span>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  Removes unpinned notices from the instructions board. All <strong>pinned</strong> instructions remain permanently visible.
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '18px 28px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          background: 'rgba(0, 0, 0, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 12
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '9px 18px',
              borderRadius: 10,
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--text-dim)',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer'
            }}
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleConfirmReset}
            disabled={submitting || successResult !== null}
            style={{
              padding: '9px 22px',
              borderRadius: 10,
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              border: '1px solid rgba(99, 102, 241, 0.4)',
              color: '#ffffff',
              fontSize: '0.88rem',
              fontWeight: 700,
              cursor: submitting ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(99, 102, 241, 0.35)',
              opacity: submitting ? 0.7 : 1
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Resetting Queue...</span>
              </>
            ) : successResult ? (
              <>
                <CheckCircle2 size={16} />
                <span>Completed</span>
              </>
            ) : (
              <>
                <RotateCcw size={16} />
                <span>Run End-of-Month Reset</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

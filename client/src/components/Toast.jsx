import React from 'react';
import { MessageSquare, Bell, ArrowRight, X } from 'lucide-react';

export default function ToastContainer({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        const isDirectivePing = toast.type === 'directive-ping';
        return (
          <div 
            key={toast.id} 
            className={`toast ${isDirectivePing ? 'toast-directive-ping' : ''}`}
            onClick={() => {
              if (toast.onAction) toast.onAction();
              onDismiss(toast.id);
            }}
            style={isDirectivePing ? {
              background: 'linear-gradient(135deg, rgba(30, 20, 28, 0.96) 0%, rgba(20, 24, 40, 0.96) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.55)',
              boxShadow: '0 8px 32px rgba(239, 68, 68, 0.3), 0 2px 10px rgba(0,0,0,0.5)',
              cursor: 'pointer',
              minWidth: '280px',
              maxWidth: '380px'
            } : undefined}
          >
            <div style={{
              width: 36,
              height: 36,
              borderRadius: '10px',
              background: isDirectivePing 
                ? 'linear-gradient(135deg, #ef4444 0%, #f59e0b 100%)' 
                : 'var(--primary-gradient)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              boxShadow: isDirectivePing ? '0 0 16px rgba(239, 68, 68, 0.5)' : undefined
            }}>
              {isDirectivePing ? <Bell size={18} color="#fff" /> : <MessageSquare size={16} color="#fff" />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontSize: '0.86rem', 
                fontWeight: 700, 
                color: isDirectivePing ? '#fca5a5' : 'inherit',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between',
                gap: 6 
              }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {toast.title}
                </span>
                {isDirectivePing && (
                  <span style={{
                    fontSize: '0.64rem',
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: 'rgba(239, 68, 68, 0.25)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    color: '#f87171',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    flexShrink: 0
                  }}>
                    SOUND PING
                  </span>
                )}
              </div>
              <div style={{ 
                fontSize: '0.78rem', 
                color: isDirectivePing ? '#e2e8f0' : 'var(--text-muted)',
                marginTop: 2,
                lineHeight: 1.35
              }}>
                {toast.message}
              </div>
              {toast.actionLabel && (
                <div style={{ marginTop: 8 }}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (toast.onAction) toast.onAction();
                      onDismiss(toast.id);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      padding: '4px 12px',
                      borderRadius: 6,
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      color: '#ffffff',
                      border: 'none',
                      cursor: 'pointer',
                      boxShadow: '0 2px 8px rgba(239, 68, 68, 0.35)'
                    }}
                  >
                    <span>{toast.actionLabel}</span>
                    <ArrowRight size={12} />
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(toast.id);
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 4,
                flexShrink: 0
              }}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}


import React from 'react';
import { AlertTriangle, RefreshCw, MessageSquare, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const sectionName = this.props.sectionName || 'view';

      return (
        <div style={{
          padding: '40px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '60vh',
          width: '100%'
        }}>
          <div style={{
            maxWidth: 540,
            width: '100%',
            background: 'linear-gradient(145deg, rgba(17, 24, 39, 0.9) 0%, rgba(13, 18, 31, 0.95) 100%)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 20,
            padding: '32px',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 30px rgba(239, 68, 68, 0.1)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
            backdropFilter: 'blur(12px)'
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f87171',
              boxShadow: '0 4px 20px rgba(239, 68, 68, 0.25)'
            }}>
              <AlertTriangle size={28} />
            </div>

            <div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
                Something went wrong in this {sectionName}
              </h3>
              <p style={{ margin: '8px 0 0 0', fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                An unexpected error occurred while rendering this component. The rest of QuantumPropAI is still working normally.
              </p>
            </div>

            {this.state.error && (
              <div style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                background: 'rgba(0, 0, 0, 0.4)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#fca5a5',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                textAlign: 'left',
                overflowX: 'auto',
                maxHeight: 120
              }}>
                {this.state.error.toString()}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center', marginTop: 6 }}>
              <button
                type="button"
                onClick={this.handleReset}
                style={{
                  padding: '9px 18px',
                  borderRadius: 10,
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  border: '1px solid rgba(99, 102, 241, 0.4)',
                  color: '#ffffff',
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)'
                }}
              >
                <RefreshCw size={15} />
                <span>Try Reloading Section</span>
              </button>

              {this.props.onNavigateToChat && (
                <button
                  type="button"
                  onClick={() => {
                    this.handleReset();
                    this.props.onNavigateToChat();
                  }}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 10,
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    color: 'var(--text-dim)',
                    fontSize: '0.86rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 7
                  }}
                >
                  <MessageSquare size={15} />
                  <span>Return to Chat</span>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

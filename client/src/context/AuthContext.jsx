import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('QuantumPropAI_token') || null);
  const [loading, setLoading] = useState(true);

  const [sessionExpiredNotice, setSessionExpiredNotice] = useState(false);

  const logout = (reason = '') => {
    localStorage.removeItem('QuantumPropAI_token');
    setToken(null);
    setUser(null);
    if (reason === 'expired') {
      setSessionExpiredNotice(true);
    }
  };

  // Global 401 Response Interceptor: auto-catches expired/invalid JWT across all components
  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      if (response.status === 401) {
        const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
        // Exclude login/signup attempts where 401 is an expected credential rejection
        const isAuthAttempt = url.includes('/api/auth/login') || url.includes('/api/auth/signup');
        
        if (!isAuthAttempt && localStorage.getItem('QuantumPropAI_token')) {
          console.warn('[QuantumPropAI Auth] 401 Unauthorized detected. Session expired.');
          logout('expired');
          window.dispatchEvent(new CustomEvent('QuantumPropAI_session_expired', {
            detail: { message: 'Your session has expired. Please sign in again.' }
          }));
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  // Verify stored token on initial load
  useEffect(() => {
    async function verifyAuth() {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const res = await fetch('/api/auth/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        } else {
          // Token invalid or expired
          logout('expired');
        }
      } catch (err) {
        console.error('Failed to verify authentication:', err);
      } finally {
        setLoading(false);
      }
    }
    verifyAuth();
  }, [token]);

  const login = async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Login failed');
    }

    localStorage.setItem('QuantumPropAI_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const signup = async ({ username, displayName, password, avatar, bio }) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, displayName, password, avatar, bio })
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Sign up failed');
    }

    localStorage.setItem('QuantumPropAI_token', data.token);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  };

  const updateProfile = async (updates) => {
    const res = await fetch('/api/users/profile', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to update profile');
    }

    if (user && data.user && data.user.id === user.id) {
      setUser(data.user);
    }
    return data.user;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      setUser, 
      token, 
      loading, 
      login, 
      signup, 
      logout, 
      updateProfile,
      sessionExpiredNotice,
      setSessionExpiredNotice
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { soundManager } from '../utils/sound';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const [socket, setSocket] = useState(null);
  const [onlineUserIds, setOnlineUserIds] = useState([]);
  const [connected, setConnected] = useState(false);
  const [reconnectCount, setReconnectCount] = useState(0);

  useEffect(() => {
    if (!token || !user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
        setConnected(false);
      }
      return;
    }

    const newSocket = io('/', {
      auth: { token },
      reconnectionAttempts: 20,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('Connected to QuantumPropAI real-time socket:', newSocket.id);
      setConnected(true);
      newSocket.emit('get_online_users', (users) => {
        if (Array.isArray(users)) {
          setOnlineUserIds(users);
        }
      });
    });

    newSocket.io.on('reconnect', () => {
      console.log('[Socket] Reconnected after network disruption. Triggering re-sync...');
      setReconnectCount(c => c + 1);
      window.dispatchEvent(new CustomEvent('QuantumPropAI_socket_reconnected'));
    });

    newSocket.on('disconnect', () => {
      console.log('Socket disconnected');
      setConnected(false);
    });

    newSocket.on('presence_update', ({ userId, isOnline, onlineUserIds: latestOnline }) => {
      if (Array.isArray(latestOnline)) {
        setOnlineUserIds(latestOnline);
      } else {
        setOnlineUserIds(prev => {
          if (isOnline) {
            return prev.includes(userId) ? prev : [...prev, userId];
          } else {
            return prev.filter(id => id !== userId);
          }
        });
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [token, user?.id]);

  const isUserOnline = (userId) => {
    return onlineUserIds.includes(userId);
  };

  return (
    <SocketContext.Provider value={{ socket, connected, onlineUserIds, isUserOnline, reconnectCount }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}

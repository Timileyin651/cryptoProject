/**
 * Socket.IO client singleton.
 *
 * Connects with JWT auth, auto-reconnects, and exposes typed event helpers.
 */

import { io, Socket } from 'socket.io-client';
import { getAccessToken } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io('/', {
      auth: () => ({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
      console.log('[WS] Connected', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
    });

    socket.on('connect_error', (err) => {
      console.warn('[WS] Connection error:', err.message);
    });
  }

  return socket;
}

/**
 * Update auth token (e.g. after login/refresh).
 * Must reconnect with the new token.
 */
export function updateSocketAuth(token: string | null) {
  if (socket) {
    socket.auth = { token: token || '' };
    if (socket.connected) {
      socket.disconnect().connect();
    }
  }
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

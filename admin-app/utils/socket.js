
import { io } from 'socket.io-client';
import { BACKEND_URL } from '../config';

let socket = null;

export function getSocket() {
  if (!socket || !socket.connected) {
    socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],  // websocket first, polling fallback
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      timeout: 20000,
      forceNew: false,
    });
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

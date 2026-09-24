import { io } from 'socket.io-client';

export const socket = io();

// Emit with an ack, resolving to { ok, error?, ...data }.
export function emit(event, payload) {
  return new Promise((resolve) => {
    socket.timeout(8000).emit(event, payload, (err, res) => {
      resolve(err ? { ok: false, error: 'No connection to the server' } : res);
    });
  });
}

// sessionStorage keeps each browser tab its own player (handy for testing),
// localStorage remembers the last seat so a phone can rejoin after closing the tab.
export const store = {
  get(key) {
    try {
      return JSON.parse(sessionStorage.getItem(key)) ?? null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
  remembered(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? null;
    } catch {
      return null;
    }
  },
  clear(key) {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch {}
  },
};

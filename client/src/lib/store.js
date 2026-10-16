import { create } from 'zustand';

const saved = (() => { try { return JSON.parse(localStorage.getItem('opshub.auth') || 'null'); } catch { return null; } })();

export const useAuth = create((set) => ({
  token: saved?.token || null,
  user: saved?.user || null,
  setAuth: (token, user) => { localStorage.setItem('opshub.auth', JSON.stringify({ token, user })); set({ token, user }); },
  logout: () => { localStorage.removeItem('opshub.auth'); set({ token: null, user: null }); },
}));

export const useToasts = create((set) => ({
  toasts: [],
  push: (message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), tone === 'bad' ? 6000 : 3200);
  },
}));
export const toast = {
  ok: (m) => useToasts.getState().push(m, 'ok'),
  bad: (m) => useToasts.getState().push(m, 'bad'),
  info: (m) => useToasts.getState().push(m, 'info'),
};

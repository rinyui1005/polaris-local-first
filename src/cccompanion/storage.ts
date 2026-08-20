import type { ConnectionSettings } from './types';

const STORAGE_KEY = 'polaris-cc-connection-v1';

export function loadConnectionSettings(): ConnectionSettings | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ConnectionSettings>;
    if (typeof value.baseUrl !== 'string' || typeof value.token !== 'string' || !value.token) {
      return null;
    }
    return { baseUrl: value.baseUrl, token: value.token };
  } catch {
    return null;
  }
}

export function saveConnectionSettings(settings: ConnectionSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function clearConnectionSettings() {
  window.localStorage.removeItem(STORAGE_KEY);
}

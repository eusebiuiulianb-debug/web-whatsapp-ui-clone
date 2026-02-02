import { useState, useEffect } from 'react';

/**
 * Adult Gate Store - Persistent state management for adult content confirmation
 * Uses localStorage with TTL (7 days) to persist user's 18+ confirmation
 */

const ADULT_CONFIRM_STORAGE_KEY = 'novsy_adult_confirmed_at';
const ADULT_CONFIRM_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

type AdultGateState = {
  adultOk: boolean;
  hydrated: boolean;
};

const state: AdultGateState = {
  adultOk: false,
  hydrated: false,
};

const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function getAdultGateState(): AdultGateState {
  return { ...state };
}

export function subscribeAdultGate(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setAdultOk(value: boolean): void {
  state.adultOk = value;
  notify();
}

export function confirmAdult(): void {
  if (typeof window === 'undefined') return;
  const now = Date.now();
  try {
    window.localStorage.setItem(ADULT_CONFIRM_STORAGE_KEY, String(now));
    state.adultOk = true;
    notify();
  } catch (_err) {
    // Ignore storage errors
    state.adultOk = true;
    notify();
  }
}

export function hydrateAdultGate(): void {
  if (typeof window === 'undefined') {
    state.hydrated = true;
    notify();
    return;
  }

  const now = Date.now();
  try {
    const raw = window.localStorage.getItem(ADULT_CONFIRM_STORAGE_KEY);
    if (!raw) {
      state.adultOk = false;
      state.hydrated = true;
      notify();
      return;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      window.localStorage.removeItem(ADULT_CONFIRM_STORAGE_KEY);
      state.adultOk = false;
      state.hydrated = true;
      notify();
      return;
    }

    // Check if TTL has expired
    if (now - parsed > ADULT_CONFIRM_TTL_MS) {
      window.localStorage.removeItem(ADULT_CONFIRM_STORAGE_KEY);
      state.adultOk = false;
      state.hydrated = true;
      notify();
      return;
    }

    state.adultOk = true;
    state.hydrated = true;
    notify();
  } catch (_err) {
    state.adultOk = false;
    state.hydrated = true;
    notify();
  }
}

export function resetAdultGate(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(ADULT_CONFIRM_STORAGE_KEY);
    state.adultOk = false;
    notify();
  } catch (_err) {
    // Ignore storage errors
  }
}

/**
 * React hook to use adult gate state
 */
export function useAdultGateStore(): AdultGateState & {
  confirmAdult: () => void;
  reset: () => void;
} {
  const [localState, setLocalState] = useState<AdultGateState>(getAdultGateState);

  useEffect(() => {
    const unsubscribe = subscribeAdultGate(() => {
      setLocalState(getAdultGateState());
    });
    return unsubscribe;
  }, []);

  return {
    ...localState,
    confirmAdult,
    reset: resetAdultGate,
  };
}

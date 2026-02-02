import { useEffect } from 'react';
import { hydrateAdultGate, getAdultGateState } from '../../store/useAdultGate';

/**
 * AdultGateHydrator - Client component that hydrates adult gate state from localStorage
 * Must be mounted once in the app layout to restore persisted adult confirmation
 */
export function AdultGateHydrator() {
  useEffect(() => {
    const state = getAdultGateState();
    if (!state.hydrated) {
      hydrateAdultGate();
    }
  }, []);

  return null;
}

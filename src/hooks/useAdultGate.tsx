import { useCallback, useMemo, useRef, useState } from "react";
import { AdultGateModal } from "../components/modals/AdultGateModal";
import { confirmAdultAccess, hasAdultAccess } from "../lib/adultGate";

type UseAdultGateOptions = {
  onCancel?: () => void;
  onConfirm?: () => void;
};

export function useAdultGate(options: UseAdultGateOptions = {}) {
  const { onCancel, onConfirm } = options;
  const [open, setOpen] = useState(false);
  const [adultOk, setAdultOk] = useState(() => hasAdultAccess());
  const pendingActionRef = useRef<(() => void) | null>(null);

  const requireAdultGate = useCallback(
    (action?: () => void) => {
      const allowed = adultOk || hasAdultAccess();
      if (allowed) {
        if (!adultOk) setAdultOk(true);
        action?.();
        return true;
      }
      pendingActionRef.current = action ?? null;
      setOpen(true);
      return false;
    },
    [adultOk]
  );

  const openGate = useCallback(() => {
    const allowed = adultOk || hasAdultAccess();
    if (allowed) {
      if (!adultOk) setAdultOk(true);
      return;
    }
    setOpen(true);
  }, [adultOk]);

  const closeGate = useCallback(() => {
    setOpen(false);
    pendingActionRef.current = null;
  }, []);

  const handleConfirm = useCallback(async () => {
    const ok = await confirmAdultAccess();
    if (!ok) return;
    setAdultOk(true);
    setOpen(false);
    const pending = pendingActionRef.current;
    pendingActionRef.current = null;
    if (pending) pending();
    onConfirm?.();
  }, [onConfirm]);

  const handleCancel = useCallback(() => {
    setOpen(false);
    pendingActionRef.current = null;
    onCancel?.();
  }, [onCancel]);

  const modal = useMemo(
    () => <AdultGateModal open={open} onConfirm={handleConfirm} onCancel={handleCancel} />,
    [handleCancel, handleConfirm, open]
  );

  return { adultOk, isOpen: open, requireAdultGate, openGate, closeGate, modal };
}

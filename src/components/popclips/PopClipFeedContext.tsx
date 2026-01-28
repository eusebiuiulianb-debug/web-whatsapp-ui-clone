import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type PopClipFeedContextValue = {
  ids: string[];
  currentIndex: number;
  locationActive: boolean;
  hasHydrated: boolean;
  onRequestLocation?: () => void;
  setIds: (ids: string[]) => void;
  setFeed: (ids: string[], currentIndex: number) => void;
  setCurrentIndex: (currentIndex: number) => void;
  setLocationActive: (active: boolean) => void;
  setHasHydrated: (value: boolean) => void;
  setOnRequestLocation: (handler?: () => void) => void;
  clear: () => void;
};

const PopClipFeedContext = createContext<PopClipFeedContextValue | null>(null);

const normalizeIds = (ids: string[]) => {
  const normalized: string[] = [];
  const seen = new Set<string>();
  ids.forEach((id) => {
    if (typeof id !== "string") return;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    normalized.push(trimmed);
  });
  return normalized;
};

export function PopClipFeedProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>([]);
  const [currentIndex, setCurrentIndexState] = useState(-1);
  const [locationActive, setLocationActiveState] = useState(false);
  const [hasHydrated, setHasHydratedState] = useState(false);
  const [onRequestLocation, setOnRequestLocationState] = useState<(() => void) | undefined>(undefined);

  const setIdsOnly = useCallback((nextIds: string[]) => {
    const normalized = normalizeIds(Array.isArray(nextIds) ? nextIds : []);
    setIds(normalized);
    setCurrentIndexState((prev) => {
      if (normalized.length === 0) return -1;
      const resolved = Number.isFinite(prev) ? prev : -1;
      return Math.max(0, Math.min(normalized.length - 1, Math.floor(resolved)));
    });
  }, []);

  const setFeed = useCallback((nextIds: string[], nextIndex: number) => {
    const normalized = normalizeIds(Array.isArray(nextIds) ? nextIds : []);
    const resolvedIndex =
      normalized.length === 0 ? -1 : Math.max(0, Math.min(normalized.length - 1, Math.floor(nextIndex)));
    setIds(normalized);
    setCurrentIndexState(resolvedIndex);
  }, []);

  const setCurrentIndex = useCallback(
    (nextIndex: number) => {
      setCurrentIndexState(() => {
        if (ids.length === 0) return -1;
        return Math.max(0, Math.min(ids.length - 1, Math.floor(nextIndex)));
      });
    },
    [ids]
  );

  const clear = useCallback(() => {
    setIds([]);
    setCurrentIndexState(-1);
  }, []);

  const setLocationActive = useCallback((active: boolean) => {
    setLocationActiveState(Boolean(active));
  }, []);

  const setHasHydrated = useCallback((value: boolean) => {
    setHasHydratedState(Boolean(value));
  }, []);

  const setOnRequestLocation = useCallback((handler?: () => void) => {
    setOnRequestLocationState(typeof handler === "function" ? handler : undefined);
  }, []);

  const value = useMemo(
    () => ({
      ids,
      currentIndex,
      locationActive,
      hasHydrated,
      onRequestLocation,
      setIds: setIdsOnly,
      setFeed,
      setCurrentIndex,
      setLocationActive,
      setHasHydrated,
      setOnRequestLocation,
      clear,
    }),
    [
      ids,
      currentIndex,
      locationActive,
      hasHydrated,
      onRequestLocation,
      setIdsOnly,
      setFeed,
      setCurrentIndex,
      setLocationActive,
      setHasHydrated,
      setOnRequestLocation,
      clear,
    ]
  );

  return <PopClipFeedContext.Provider value={value}>{children}</PopClipFeedContext.Provider>;
}

export function usePopClipFeedContext() {
  return useContext(PopClipFeedContext);
}

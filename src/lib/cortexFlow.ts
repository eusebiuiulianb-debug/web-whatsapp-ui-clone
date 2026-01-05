export type CortexFlowState = {
  from: "cortex";
  segmentKey: string;
  segmentLabel?: string;
  fanIdsInSegment: string[];
  fanNamesById?: Record<string, string>;
  draftsByFanId?: Record<string, string>;
  currentFanId: string;
  actionKey?: string;
  autoNext?: boolean;
};

export const CORTEX_FLOW_STORAGE_KEY = "novsy:cortexFlow";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string");

export function readCortexFlow(): CortexFlowState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CORTEX_FLOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CortexFlowState> | null;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.from !== "cortex") return null;
    if (typeof parsed.segmentKey !== "string") return null;
    if (!isStringArray(parsed.fanIdsInSegment)) return null;
    if (typeof parsed.currentFanId !== "string") return null;
    return parsed as CortexFlowState;
  } catch (_err) {
    return null;
  }
}

export function writeCortexFlow(flow: CortexFlowState) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(CORTEX_FLOW_STORAGE_KEY, JSON.stringify(flow));
  } catch (_err) {
    // ignore storage errors
  }
}

export function clearCortexFlow() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(CORTEX_FLOW_STORAGE_KEY);
  } catch (_err) {
    // ignore storage errors
  }
}

export function getNextFanFromFlow(flow: CortexFlowState) {
  const idx = flow.fanIdsInSegment.indexOf(flow.currentFanId);
  if (idx < 0 || idx + 1 >= flow.fanIdsInSegment.length) {
    return { nextFanId: null as string | null, nextFanName: null as string | null };
  }
  const nextFanId = flow.fanIdsInSegment[idx + 1];
  const nextFanName = flow.fanNamesById?.[nextFanId] ?? null;
  return { nextFanId, nextFanName };
}

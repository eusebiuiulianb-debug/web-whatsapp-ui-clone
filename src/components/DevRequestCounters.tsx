import { useEffect, useState } from "react";
import { getDevRequestRates, subscribeDevRequestRates } from "../lib/devRequestStats";

export function DevRequestCounters() {
  const isDev = process.env.NODE_ENV !== "production";
  const [rates, setRates] = useState(() => (isDev ? getDevRequestRates() : { fans: 0, messages: 0 }));

  useEffect(() => {
    if (!isDev) return;
    const update = () => setRates(getDevRequestRates());
    const unsubscribe = subscribeDevRequestRates(update);
    const interval = window.setInterval(update, 5000);
    update();
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [isDev]);

  if (!isDev) return null;

  return (
    <div className="mt-2 inline-flex items-center gap-3 rounded-md border border-[color:var(--surface-border)] bg-[color:var(--surface-2)] px-2 py-1 text-[10px] text-[color:var(--muted)] tabular-nums">
      <span>Fans req/min {rates.fans}</span>
      <span>Messages req/min {rates.messages}</span>
    </div>
  );
}

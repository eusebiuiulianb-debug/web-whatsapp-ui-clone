export function hardNavigate(path: string) {
  if (typeof window === "undefined") return;
  if (!path) return;
  const target = path.trim();
  if (!target) return;
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (current === target) return;
  window.location.assign(target);
}

export type SavedPopclipEntry = {
  id: string;
  entityId: string;
  collectionId?: string | null;
};

export type SavedPopclipsPayload = {
  items: SavedPopclipEntry[];
};

export const SAVED_POPCLIPS_KEY = "/api/saved/items?type=POPCLIP";

export async function fetchSavedPopclips(url: string): Promise<SavedPopclipsPayload> {
  const res = await fetch(url);
  if (res.status === 401) return { items: [] };
  const payload = (await res.json().catch(() => null)) as
    | { items?: Array<{ id?: string; entityId?: string; collectionId?: string | null }> }
    | null;
  if (!res.ok || !payload || !Array.isArray(payload.items)) {
    return { items: [] };
  }
  const items: SavedPopclipEntry[] = [];
  payload.items.forEach((entry) => {
    const id = typeof entry?.id === "string" ? entry.id : "";
    const entityId = typeof entry?.entityId === "string" ? entry.entityId : "";
    if (!id || !entityId) return;
    items.push({
      id,
      entityId,
      collectionId: typeof entry.collectionId === "string" ? entry.collectionId : null,
    });
  });
  return { items };
}

export function buildSavedPopclipMap(items: SavedPopclipEntry[]) {
  const next: Record<string, { savedItemId: string; collectionId: string | null }> = {};
  items.forEach((entry) => {
    if (!entry.entityId || !entry.id) return;
    next[entry.entityId] = {
      savedItemId: entry.id,
      collectionId: entry.collectionId ?? null,
    };
  });
  return next;
}

export function upsertSavedPopclip(items: SavedPopclipEntry[], entry: SavedPopclipEntry) {
  const filtered = items.filter((item) => item.entityId !== entry.entityId);
  return [entry, ...filtered];
}

export function removeSavedPopclip(items: SavedPopclipEntry[], entityId: string) {
  return items.filter((item) => item.entityId !== entityId);
}

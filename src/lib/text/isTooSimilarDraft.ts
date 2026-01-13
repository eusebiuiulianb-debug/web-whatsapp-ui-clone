import { sanitizeAiDraftText } from "./sanitizeAiDraft";

function normalize(text: string): string {
  const cleaned = sanitizeAiDraftText(text);
  if (!cleaned) return "";
  return cleaned
    .toLowerCase()
    .replace(/[.,;:!?¡¿[\]()*"“”'’`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sliceHeadTokens(text: string, tokenCount = 12): string[] {
  return text.split(/\s+/).slice(0, tokenCount).filter(Boolean);
}

function hasLongOverlap(a: string, b: string, minLen: number): boolean {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  if (shorter.length < minLen) return false;
  for (let i = 0; i <= shorter.length - minLen; i += 4) {
    const slice = shorter.slice(i, i + minLen);
    if (longer.includes(slice)) return true;
  }
  return false;
}

export function isTooSimilarDraft(text: string, avoid: string[], headMatchTokens = 12): boolean {
  if (!avoid || avoid.length === 0) return false;
  const normalized = normalize(text);
  if (!normalized) return false;
  const head = sliceHeadTokens(normalized, headMatchTokens);

  for (const entry of avoid) {
    const cleaned = normalize(entry);
    if (!cleaned) continue;
    const entryHead = sliceHeadTokens(cleaned, headMatchTokens);
    const sharedHead = entryHead.filter((token, idx) => token === head[idx]);
    if (sharedHead.length >= 8) return true;
    if (hasLongOverlap(normalized, cleaned, 20)) return true;
  }

  return false;
}

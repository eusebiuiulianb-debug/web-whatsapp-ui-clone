const DEFAULT_THRESHOLD = 0.88;

function normalizeForSimilarity(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toUnits(normalized: string): string[] {
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length <= 1) return tokens;
  return tokens.slice(0, -1).map((token, index) => `${token} ${tokens[index + 1]}`);
}

export function getNearDuplicateSimilarity(a: string, b: string): number {
  const unitsA = toUnits(normalizeForSimilarity(a));
  const unitsB = toUnits(normalizeForSimilarity(b));
  if (unitsA.length === 0 || unitsB.length === 0) return 0;
  const setA = new Set(unitsA);
  const setB = new Set(unitsB);
  let intersection = 0;
  setA.forEach((unit) => {
    if (setB.has(unit)) intersection += 1;
  });
  const union = setA.size + setB.size - intersection;
  if (union === 0) return 0;
  return intersection / union;
}

export function isNearDuplicate(a: string, b: string, threshold = DEFAULT_THRESHOLD): boolean {
  return getNearDuplicateSimilarity(a, b) >= threshold;
}

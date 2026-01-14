export function sanitizeAiDraftText(raw: string): string {
  if (!raw) return "";
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter(
      (line) =>
        !/^eres\s+el\s+manager/i.test(line) &&
        !/^eres\s+la\s+manager/i.test(line) &&
        !/^eres\s+el\s+asistente/i.test(line) &&
        !/^responde\s+al\s+fan/i.test(line)
    )
    .map((line) => line.replace(/^\s*(\*\*)?(borrador|draft)\s*:\s*(\*\*)?/i, "").trim())
    .filter((line) => line.length > 0);

  return lines.join("\n").trim();
}

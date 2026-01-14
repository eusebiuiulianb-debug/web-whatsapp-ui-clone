type PolicyMessage = { content?: string | null };

export type AdultPolicyInput = {
  text?: string | null;
  messages?: PolicyMessage[] | null;
  allowExplicitAdultContent?: boolean;
};

export type AdultPolicyDecision = {
  allowed: boolean;
  code: string;
  reason: string;
};

const UNDERAGE_PATTERNS: RegExp[] = [
  /\b(tengo|cumplo)\s*1[0-7]\b/i,
  /\b(tengo|cumplo)\s*1[0-7]\s*(años|anos)\b/i,
  /\b1[0-7]\s*(años|anos)\b/i,
  /\bsoy\s*menor\b/i,
  /\bmenor\s+de\s+edad\b/i,
  /\bunderage\b/i,
  /\bminor\b/i,
  /\bteen\b/i,
  /\bhigh\s*school\b/i,
  /\bsecundaria\b/i,
  /\bcolegio\b/i,
];

const NON_CONSENT_PATTERNS: RegExp[] = [
  /\bsin\s+consentimiento\b/i,
  /\bno\s+consentido\b/i,
  /\bno\s+me\s+digas\s+que\s+no\b/i,
  /\bforzar\b/i,
  /\bforce\b/i,
  /\bobligar\b/i,
  /\bviolaci[oó]n\b/i,
  /\brape\b/i,
  /\bno\s+quiero\s+pero\b/i,
  /\bno\s+puedo\s+decir\s+que\s+no\b/i,
];

const INCEST_PATTERNS: RegExp[] = [
  /\bincest(o)?\b/i,
  /\b(stepmom|stepdad|stepsister|stepbrother|stepmother|stepfather)\b/i,
  /\b(padrastro|madrastra|hermanastro|hermanastra)\b/i,
];

const BESTIALITY_PATTERNS: RegExp[] = [
  /\bzoofilia\b/i,
  /\bbestiality\b/i,
  /\bsexo\s+con\s+animales?\b/i,
  /\bcon\s+(mi|el|la)\s+(perro|perra|caballo)\b/i,
];

const EXPLICIT_PATTERNS: RegExp[] = [
  /\b(tetas|pechos|pezones|polla|pene|vagina|clitoris|clítoris|culo)\b/i,
  /\b(nudes?|desnuda|desnudo)\b/i,
  /\b(sexo|sex|anal|oral|mamada|corrida|masturbar|masturbando|masturbaci[oó]n)\b/i,
  /\b(blowjob|boobs?|tits?|dick|cock|pussy)\b/i,
  /\bxxx\b/i,
];

function normalizeText(value?: string | null) {
  return typeof value === "string" ? value.trim() : "";
}

function buildCombinedText(input: AdultPolicyInput) {
  const pieces: string[] = [];
  const text = normalizeText(input.text);
  if (text) pieces.push(text);
  const messages = Array.isArray(input.messages) ? input.messages : [];
  for (const msg of messages) {
    const content = normalizeText(msg?.content ?? "");
    if (content) pieces.push(content);
  }
  return pieces.join("\n").trim();
}

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(text));
}

export function evaluateAdultPolicy(input: AdultPolicyInput): AdultPolicyDecision {
  const combined = buildCombinedText(input);
  if (!combined) {
    return { allowed: true, code: "OK", reason: "Sin contenido para evaluar." };
  }
  const normalized = combined.toLowerCase();

  if (matchesAny(normalized, UNDERAGE_PATTERNS)) {
    return { allowed: false, code: "UNDERAGE", reason: "Señales de menor detectadas." };
  }
  if (matchesAny(normalized, NON_CONSENT_PATTERNS)) {
    return { allowed: false, code: "NON_CONSENT", reason: "Señales de no consentimiento o coerción." };
  }
  if (matchesAny(normalized, INCEST_PATTERNS)) {
    return { allowed: false, code: "INCEST", reason: "Señales de incesto detectadas." };
  }
  if (matchesAny(normalized, BESTIALITY_PATTERNS)) {
    return { allowed: false, code: "BESTIALITY", reason: "Señales de bestialidad detectadas." };
  }

  const explicitDetected = matchesAny(normalized, EXPLICIT_PATTERNS);
  const allowExplicitAdultContent = Boolean(input.allowExplicitAdultContent);

  if (explicitDetected && !allowExplicitAdultContent) {
    return {
      allowed: true,
      code: "SUGGESTIVE_ONLY",
      reason: "Contenido explícito no permitido; usar tono sugerente.",
    };
  }

  return {
    allowed: true,
    code: allowExplicitAdultContent ? "ALLOW_EXPLICIT" : "ALLOW_SUGGESTIVE",
    reason: "Contenido permitido.",
  };
}

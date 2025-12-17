import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";

type DiscoveryAnswers = {
  intention: string;
  style: string;
  budget: string;
  responseSpeed: string;
  useLocation: boolean;
};

type Recommendation = {
  creatorId: string;
  displayName: string;
  avatarUrl?: string | null;
  priceRange?: string;
  responseHours?: number | null;
  reasons: string[];
  handle: string;
  country?: string | null;
  cityApprox?: string | null;
};

const budgetRanges: Record<string, { min: number; max: number }> = {
  "0-20": { min: 0, max: 20 },
  "20-50": { min: 20, max: 50 },
  "50-100": { min: 50, max: 100 },
  "100+": { min: 100, max: Number.POSITIVE_INFINITY },
};

const normalizeToken = (value: string) => value.toLowerCase().trim();
const slugify = (value?: string | null) => (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");

function parseNiches(raw: string | null | undefined): string[] {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(/[,|]/g)
    .map((item) => normalizeToken(item))
    .filter(Boolean);
}

function rangesOverlap(profileMin?: number | null, profileMax?: number | null, target?: { min: number; max: number }) {
  if (!target) return true;
  const min = typeof profileMin === "number" ? profileMin : 0;
  const max = typeof profileMax === "number" ? profileMax : min || target.max;
  return target.min <= max && target.max >= min;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse<{ recommendations: Recommendation[] } | { error: string }>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { intention, style, budget, responseSpeed, useLocation } = (req.body || {}) as Partial<DiscoveryAnswers>;

  if (!intention || !style || !budget || !responseSpeed || typeof useLocation !== "boolean") {
    return res.status(400).json({ error: "Respuestas incompletas" });
  }

  try {
    const profiles = await prisma.creatorDiscoveryProfile.findMany({
      where: { isDiscoverable: true },
      include: {
        creator: true,
      },
    });

    const budgetRange = budgetRanges[budget] || budgetRanges["20-50"];

    const scored = profiles
      .filter((profile) => !useLocation || profile.allowLocationMatching)
      .map((profile) => {
        const normalizedNiches = parseNiches(profile.niches);
        const normalizedStyle = normalizeToken(profile.communicationStyle || "");
        let score = 0;
        const reasons: string[] = [];

        if (normalizedNiches.includes(normalizeToken(intention))) {
          score += 2;
          reasons.push("Encaja con lo que buscas hoy");
        }

        if (normalizedStyle === normalizeToken(style)) {
          score += 2;
          reasons.push("Coincide con tu estilo preferido");
        }

        if (budgetRange) {
          if (rangesOverlap(profile.priceMin, profile.priceMax, budgetRange)) {
            score += 2;
            reasons.push("Está dentro de tu rango de precio");
          } else if (profile.priceMin !== null || profile.priceMax !== null) {
            score -= 2;
            reasons.push("Fuera de tu rango actual");
          }
        }

        const responseHours = typeof profile.responseHours === "number" ? profile.responseHours : null;
        if (responseHours !== null) {
          if (normalizeToken(responseSpeed) === "rapido") {
            if (responseHours <= 12) {
              score += 2;
              reasons.push("Responde en menos de 12h");
            } else if (responseHours <= 24) {
              score += 1;
              reasons.push("Suele responder en menos de 24h");
            }
          } else if (normalizeToken(responseSpeed) === "normal") {
            if (responseHours <= 24) {
              score += 2;
              reasons.push("Tiempo de respuesta estándar");
            } else if (responseHours <= 48) {
              score += 1;
              reasons.push("Respuesta en menos de 48h");
            }
          }
        }

        if (useLocation && profile.allowLocationMatching) {
          score += 1;
          reasons.push("Puede usar ubicación aproximada para personalizar");
        }

        const trimmedReasons = reasons.length >= 2 ? reasons.slice(0, 3) : [...reasons, "Tiene disponibilidad para nuevos fans", "Chat 1:1 activo"].slice(0, 3);

        const recommendation: Recommendation = {
          creatorId: profile.creatorId,
          displayName: profile.creator?.name || "Creador",
          avatarUrl: profile.creator?.bioLinkAvatarUrl || null,
          priceRange: buildPriceRange(profile.priceMin, profile.priceMax),
          responseHours,
          reasons: trimmedReasons,
          handle: slugify(profile.creator?.name),
          country: profile.showCountry ? profile.country || null : null,
          cityApprox: profile.showCityApprox ? profile.cityApprox || null : null,
        };

        return { score, recommendation };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 7)
      .map((item) => item.recommendation);

    return res.status(200).json({ recommendations: scored });
  } catch (err) {
    console.error("Error in discovery recommendations", err);
    return res.status(500).json({ error: "No se pudieron generar recomendaciones" });
  }
}

function buildPriceRange(min?: number | null, max?: number | null) {
  if (typeof min === "number" && typeof max === "number") return `${min}€ - ${max}€`;
  if (typeof min === "number" && max === null) return `Desde ${min}€`;
  if (typeof min === "number") return `Desde ${min}€`;
  if (typeof max === "number") return `Hasta ${max}€`;
  return undefined;
}

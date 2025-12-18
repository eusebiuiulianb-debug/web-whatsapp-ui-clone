import type { NextApiRequest, NextApiResponse } from "next";
import prisma from "../../../lib/prisma.server";
import { sendBadRequest, sendServerError } from "../../../lib/apiError";

const DEFAULT_STYLE = "calido";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") return handleGet(res);
  if (req.method === "POST" || req.method === "PUT") return handleUpsert(req, res);

  res.setHeader("Allow", "GET, POST, PUT");
  return res.status(405).json({ error: "Method not allowed" });
}

async function handleGet(res: NextApiResponse) {
  try {
    const creatorId = await resolveCreatorId();
    const profile = await getOrCreateProfile(creatorId);
    return res.status(200).json(profile);
  } catch (err) {
    console.error("Error loading discovery profile", err);
    return sendServerError(res);
  }
}

async function handleUpsert(req: NextApiRequest, res: NextApiResponse) {
  const {
    isDiscoverable,
    niches,
    communicationStyle,
    limits,
    priceMin,
    priceMax,
    responseHours,
    allowLocationMatching,
    showCountry,
    showCityApprox,
    country,
    cityApprox,
  } = req.body || {};

  try {
    const creatorId = await resolveCreatorId();

    const parsedPriceMin = priceMin === null || priceMin === "" || priceMin === undefined ? null : Number(priceMin);
    const parsedPriceMax = priceMax === null || priceMax === "" || priceMax === undefined ? null : Number(priceMax);
    if ((parsedPriceMin !== null && Number.isNaN(parsedPriceMin)) || (parsedPriceMax !== null && Number.isNaN(parsedPriceMax))) {
      return sendBadRequest(res, "Precio inválido");
    }
    if (parsedPriceMin !== null && parsedPriceMax !== null && parsedPriceMin > parsedPriceMax) {
      return sendBadRequest(res, "priceMin no puede ser mayor que priceMax");
    }

    const parsedResponseHours =
      responseHours === null || responseHours === "" || responseHours === undefined ? null : Number(responseHours);
    if (parsedResponseHours !== null && Number.isNaN(parsedResponseHours)) {
      return sendBadRequest(res, "responseHours inválido");
    }

    const normalizedNiches = Array.isArray(niches)
      ? niches
      : typeof niches === "string"
      ? niches.split(",").map((n: string) => n.trim()).filter(Boolean)
      : [];
    const storedNiches = normalizedNiches.join(",");

    const profile = await prisma.creatorDiscoveryProfile.upsert({
      where: { creatorId },
      create: {
        creatorId,
        isDiscoverable: Boolean(isDiscoverable),
        niches: storedNiches,
        communicationStyle: typeof communicationStyle === "string" && communicationStyle.trim()
          ? communicationStyle.trim()
          : DEFAULT_STYLE,
        limits: typeof limits === "string" ? limits.trim() : "",
        priceMin: parsedPriceMin,
        priceMax: parsedPriceMax,
        responseHours: parsedResponseHours,
        allowLocationMatching: Boolean(allowLocationMatching),
        showCountry: Boolean(showCountry),
        showCityApprox: Boolean(showCountry && showCityApprox),
        country: typeof country === "string" ? country.trim() || null : null,
        cityApprox: typeof cityApprox === "string" && showCountry ? cityApprox.trim() || null : null,
      },
      update: {
        isDiscoverable: Boolean(isDiscoverable),
        niches: storedNiches,
        communicationStyle: typeof communicationStyle === "string" && communicationStyle.trim()
          ? communicationStyle.trim()
          : DEFAULT_STYLE,
        limits: typeof limits === "string" ? limits.trim() : "",
        priceMin: parsedPriceMin,
        priceMax: parsedPriceMax,
        responseHours: parsedResponseHours,
        allowLocationMatching: Boolean(allowLocationMatching),
        showCountry: Boolean(showCountry),
        showCityApprox: Boolean(showCountry && showCityApprox),
        country: typeof country === "string" ? country.trim() || null : null,
        cityApprox: typeof cityApprox === "string" && showCountry ? cityApprox.trim() || null : null,
      },
      include: {
        creator: true,
      },
    });

    return res.status(200).json(mapProfile(profile));
  } catch (err) {
    console.error("Error saving discovery profile", err);
    return sendServerError(res);
  }
}

async function getOrCreateProfile(creatorId: string) {
  const existing = await prisma.creatorDiscoveryProfile.findUnique({
    where: { creatorId },
    include: { creator: true },
  });
  if (existing) return mapProfile(existing);

  const created = await prisma.creatorDiscoveryProfile.create({
    data: {
      creatorId,
      isDiscoverable: false,
      niches: "",
      communicationStyle: DEFAULT_STYLE,
    },
    include: { creator: true },
  });
  return mapProfile(created);
}

async function resolveCreatorId() {
  if (process.env.CREATOR_ID) return process.env.CREATOR_ID;

  const creator = await prisma.creator.findFirst({
    select: { id: true },
    orderBy: { id: "asc" },
  });

  if (!creator) {
    throw new Error("No creator found");
  }

  return creator.id;
}

function mapProfile(profile: any) {
  const nichesArray = typeof profile.niches === "string" ? profile.niches.split(",").filter(Boolean) : [];
  const handle = slugify(profile.creator?.name || "creator");
  return {
    id: profile.id,
    creatorId: profile.creatorId,
    isDiscoverable: Boolean(profile.isDiscoverable),
    niches: nichesArray,
    communicationStyle: profile.communicationStyle || DEFAULT_STYLE,
    limits: profile.limits || "",
    priceMin: profile.priceMin,
    priceMax: profile.priceMax,
    responseHours: profile.responseHours,
    allowLocationMatching: Boolean(profile.allowLocationMatching),
    showCountry: Boolean(profile.showCountry),
    showCityApprox: Boolean(profile.showCountry && profile.showCityApprox),
    country: profile.showCountry ? profile.country || null : null,
    cityApprox: profile.showCountry && profile.showCityApprox ? profile.cityApprox || null : null,
    creatorName: profile.creator?.name || "Creador",
    avatarUrl: profile.creator?.bioLinkAvatarUrl || "",
    handle,
  };
}

function slugify(value?: string | null) {
  return (value || "creator").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

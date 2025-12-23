import type { NextApiRequest, NextApiResponse } from "next";
import dbHandler from "../../../server/contentProviders/db";
import localHandler from "../../../server/contentProviders/local";

const providers = {
  db: dbHandler,
  local: localHandler,
} as const;

const resolveProviderName = () =>
  (process.env.CONTENT_PROVIDER ?? process.env.CONTENT_SOURCE ?? "db").toLowerCase();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Manual checks:
  // [ ] npm run dev does not crash
  // [ ] CONTENT_PROVIDER=local; GET /api/content (no params) -> 400
  // [ ] CONTENT_PROVIDER=local; GET /api/content?key=demo -> 200
  // [ ] Repeat 5 times -> stable
  const providerName = resolveProviderName();
  const provider = providers[providerName as keyof typeof providers];

  if (!provider) {
    return res.status(500).json({
      ok: false,
      error: "invalid_provider",
      provider: providerName,
      allowed: Object.keys(providers),
    });
  }

  if (providerName === "local" && req.method === "GET") {
    const key = typeof req.query.key === "string" ? req.query.key.trim() : "";
    if (!key) {
      return res.status(400).json({ ok: false, error: "missing_param", param: "key" });
    }
  }

  try {
    return await provider(req, res);
  } catch (error) {
    console.error("Error handling /api/content", error);
    return res.status(500).json({ ok: false, error: "content_provider_failed" });
  }
}

import type { NextApiRequest, NextApiResponse } from "next";
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Modo mock: sin acceso a BD por ahora
  const items: Array<{ id: string; title: string; type: string; visibility: string; externalUrl?: string }> = [];
  return res.status(200).json({ items });
}

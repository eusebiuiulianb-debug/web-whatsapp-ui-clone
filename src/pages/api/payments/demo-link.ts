import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";

function generateToken() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Math.random().toString(36).slice(2);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  }

  try {
    const { fanId, contentId, price, currency } = req.body || {};

    if (!fanId || !contentId || typeof price !== "number" || price <= 0 || !currency) {
      return res.status(400).json({
        error: "Faltan campos obligatorios o son inválidos: fanId, contentId, price > 0 y currency.",
      });
    }

    const token = generateToken();
    const url = `https://pay.novsy.demo/checkout/${token}`;

    return res.status(200).json({ url });
  } catch (error) {
    console.error("Error creando link de pago demo", error);
    return res.status(500).json({ error: "No se pudo crear el link de pago demo" });
  }
}

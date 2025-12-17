import type { NextApiResponse } from "next";
import { redactEncryptedBlobs } from "./encryptedBlobs";

export function sendBadRequest(res: NextApiResponse, message = "Bad request") {
  return res.status(400).json({ error: redactEncryptedBlobs(message) });
}

export function sendServerError(res: NextApiResponse, message = "Internal server error") {
  return res.status(500).json({ error: redactEncryptedBlobs(message) });
}

// TODO: authentication/authorization checks for creator endpoints will plug in here.

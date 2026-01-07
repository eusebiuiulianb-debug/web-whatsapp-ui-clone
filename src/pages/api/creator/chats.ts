import type { NextApiRequest, NextApiResponse } from "next";
import fansHandler from "../fans";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  return fansHandler(req, res);
}

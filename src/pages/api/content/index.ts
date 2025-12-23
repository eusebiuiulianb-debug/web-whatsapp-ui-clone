import dbHandler from "../../../server/contentProviders/db";
import localHandler from "../../../server/contentProviders/local";

const providers = {
  db: dbHandler,
  local: localHandler,
};

const providerName = process.env.CONTENT_PROVIDER ?? process.env.CONTENT_SOURCE ?? "db";
const handler = providers[providerName as keyof typeof providers];

if (!handler) {
  const available = Object.keys(providers).join(", ");
  throw new Error(`Invalid CONTENT_PROVIDER=${providerName}. Expected one of: ${available}`);
}

export default handler;

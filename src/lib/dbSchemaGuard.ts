export const DB_SCHEMA_OUT_OF_SYNC_CODE = "DB_SCHEMA_OUT_OF_SYNC";
export const DB_SCHEMA_OUT_OF_SYNC_MESSAGE = "DB necesita migrate reset";
export const DB_SCHEMA_OUT_OF_SYNC_FIX = ["npx prisma migrate reset", "npm run dev"] as const;

export type DbSchemaOutOfSyncPayload = {
  errorCode: typeof DB_SCHEMA_OUT_OF_SYNC_CODE;
  message: string;
  fix: string[];
};

export function isDbSchemaOutOfSyncError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: string }).code === "P2022";
}

export function getDbSchemaOutOfSyncPayload(): DbSchemaOutOfSyncPayload {
  return {
    errorCode: DB_SCHEMA_OUT_OF_SYNC_CODE,
    message: DB_SCHEMA_OUT_OF_SYNC_MESSAGE,
    fix: [...DB_SCHEMA_OUT_OF_SYNC_FIX],
  };
}

export function isDbSchemaOutOfSyncPayload(payload: any): payload is DbSchemaOutOfSyncPayload {
  return payload?.errorCode === DB_SCHEMA_OUT_OF_SYNC_CODE;
}

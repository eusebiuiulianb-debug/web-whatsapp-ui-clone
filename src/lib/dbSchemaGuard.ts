export const DB_SCHEMA_OUT_OF_SYNC_CODE = "DB_MIGRATION_REQUIRED";
export const DB_SCHEMA_OUT_OF_SYNC_MESSAGE = "Ejecuta: npm run db:reset (dev)";
export const DB_SCHEMA_OUT_OF_SYNC_FIX = ["npm run db:reset"] as const;

export type DbSchemaOutOfSyncPayload = {
  errorCode: typeof DB_SCHEMA_OUT_OF_SYNC_CODE;
  code: typeof DB_SCHEMA_OUT_OF_SYNC_CODE;
  message: string;
  fix: string[];
  details?: string;
};

export function isDbSchemaOutOfSyncError(error: unknown): boolean {
  return !!error && typeof error === "object" && (error as { code?: string }).code === "P2022";
}

export function getDbSchemaOutOfSyncPayload(details?: string): DbSchemaOutOfSyncPayload {
  return {
    errorCode: DB_SCHEMA_OUT_OF_SYNC_CODE,
    code: DB_SCHEMA_OUT_OF_SYNC_CODE,
    message: DB_SCHEMA_OUT_OF_SYNC_MESSAGE,
    fix: [...DB_SCHEMA_OUT_OF_SYNC_FIX],
    details: details && details.trim().length > 0 ? details.trim() : undefined,
  };
}

export function isDbSchemaOutOfSyncPayload(payload: any): payload is DbSchemaOutOfSyncPayload {
  return payload?.errorCode === DB_SCHEMA_OUT_OF_SYNC_CODE || payload?.code === DB_SCHEMA_OUT_OF_SYNC_CODE;
}

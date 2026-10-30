import { z } from "zod";

const DatabaseTimestampSchema = z.string().datetime({ offset: true });

export function normalizeDatabaseTimestamp(value: unknown) {
  const timestamp = DatabaseTimestampSchema.parse(value);
  return new Date(timestamp).toISOString();
}

export function normalizeNullableDatabaseTimestamp(value: unknown) {
  return value == null ? undefined : normalizeDatabaseTimestamp(value);
}

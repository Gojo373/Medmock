type LogLevel = "error" | "info" | "warn";

export function logServerEvent(
  level: LogLevel,
  event: string,
  context: Record<string, boolean | number | string | null | undefined> = {},
) {
  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  });

  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

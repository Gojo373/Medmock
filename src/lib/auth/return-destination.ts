export function safeReturnDestination(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || /[\\\r\n\t]/.test(value)) return "/dashboard";
  try {
    const origin = "https://medmock.invalid";
    const resolved = new URL(value, origin);
    return resolved.origin === origin ? resolved.pathname + resolved.search + resolved.hash : "/dashboard";
  } catch { return "/dashboard"; }
}

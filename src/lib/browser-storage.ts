const memory = new Map<string, string>();

export function readBrowserPreference(key: string) {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(key); }
  catch { return memory.get(key) ?? null; }
}

export function writeBrowserPreference(key: string, value: string) {
  if (typeof window === "undefined") return;
  memory.set(key, value);
  try { window.localStorage.setItem(key, value); } catch { /* Keep the in-memory value. */ }
}

export function removeBrowserPreference(key: string) {
  if (typeof window === "undefined") return;
  memory.delete(key);
  try { window.localStorage.removeItem(key); } catch { /* Removal still applies in memory. */ }
}

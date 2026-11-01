import { existsSync } from "node:fs";

export function publishedBrowserFixture(environment: Record<string, string | undefined>, exists = existsSync) {
  const storageState = environment.E2E_AUTH_STORAGE_STATE;
  if (!storageState || !exists(storageState)) throw new Error("An existing authenticated storage state is required.");
  const paperId = environment.E2E_PUBLISHED_PAPER_ID;
  const versionId = environment.E2E_PUBLISHED_VERSION_ID;
  if (!paperId || !versionId || [paperId, versionId].some((id) => /replace|placeholder|demo|[<>]/i.test(id))) {
    throw new Error("Real published paper and version identifiers are required.");
  }
  const path = `/papers/${encodeURIComponent(paperId)}`;
  const query = `?version=${encodeURIComponent(versionId)}`;
  return { storageState, detailPath: path + query, mockPath: path + "/mock" + query, practicePath: path + "/practice" + query };
}

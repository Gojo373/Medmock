import { describe, expect, it, vi } from "vitest";

import { createImportWorkerHandler } from "@/features/imports/server/import-worker-handler";

describe("durable import worker route", () => {
  it("rejects requests without the server-only worker secret", async () => {
    const processNext = vi.fn();
    const handler = createImportWorkerHandler({
      secret: "worker-secret",
      processNext,
      workerId: () => "worker-1",
    });

    const response = await handler(
      new Request("http://localhost/api/internal/imports/process"),
    );

    expect(response.status).toBe(401);
    expect(processNext).not.toHaveBeenCalled();
  });

  it("claims and processes one durable job for an authorized cron request", async () => {
    const processNext = vi.fn().mockResolvedValue({
      processed: true,
      importId: "import-1",
    });
    const handler = createImportWorkerHandler({
      secret: "worker-secret",
      processNext,
      workerId: () => "worker-1",
    });

    const response = await handler(
      new Request("http://localhost/api/internal/imports/process", {
        headers: { authorization: "Bearer worker-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      processed: true,
      importId: "import-1",
    });
    expect(processNext).toHaveBeenCalledWith("worker-1");
  });

  it("returns a retryable failure after the processor persists the error", async () => {
    const handler = createImportWorkerHandler({
      secret: "worker-secret",
      processNext: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      workerId: () => "worker-1",
    });

    const response = await handler(
      new Request("http://localhost/api/internal/imports/process", {
        headers: { authorization: "Bearer worker-secret" },
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "worker_failed" });
  });
});

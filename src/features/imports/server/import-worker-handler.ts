import { logServerEvent } from "@/lib/server/logger";

export type WorkerHandlerDependencies = {
  secret: string;
  processNext(workerId: string): Promise<unknown>;
  workerId(): string;
};

export function createImportWorkerHandler(
  dependencies: WorkerHandlerDependencies,
) {
  return async function handle(request: Request) {
    const authorization = request.headers.get("authorization");
    if (authorization !== `Bearer ${dependencies.secret}`) {
      return Response.json({ error: "unauthorized" }, { status: 401 });
    }

    const workerId = dependencies.workerId();
    try {
      const result = await dependencies.processNext(workerId);
      return Response.json(result);
    } catch {
      logServerEvent("error", "import.worker_failed", { workerId });
      return Response.json({ error: "worker_failed" }, { status: 503 });
    }
  };
}

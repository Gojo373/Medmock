import { act, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExamWorkspace } from "@/features/exam/exam-workspace";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";
import { scoreAttempt } from "@/features/exam/scoring";
import { AttemptSchema } from "@/features/exam/domain";
import { AnswerEventSchema } from "@/features/exam/contracts";
import type { ExamSessionState } from "@/features/exam/session";

const saved = vi.hoisted(() => ({ sessions: new Map<string, ExamSessionState>(), syncRequests: 0 }));
vi.mock("@/features/exam/persistence", async (original) => {
  const actual = await original<typeof import("@/features/exam/persistence")>();
  return {
    ...actual,
    createAttemptEventSyncController: (...args: Parameters<typeof actual.createAttemptEventSyncController>) => {
      const controller = actual.createAttemptEventSyncController(...args);
      return { request: () => { saved.syncRequests++; if (saved.syncRequests > 20) throw new Error("Repeated terminal sync loop"); return controller.request(); } };
    },
    IndexedDbAttemptPersistence: class {
      async loadSession(id: string) { return saved.sessions.get(id); }
      async saveSession(session: ExamSessionState) { saved.sessions.set(session.attemptId, session); }
      async getQueuedEvents() { return []; }
      async queueEvents() {}
      async markEventsSynced() {}
      async migrateSessionAttempt(previous: string, session: ExamSessionState) { saved.sessions.delete(previous); saved.sessions.set(session.attemptId, session); }
      async retireAttempt(id: string) { saved.sessions.delete(id); }
    },
  };
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); saved.sessions.clear(); saved.syncRequests = 0; });

function serverResult(attemptId: string) {
  const timestamp = new Date().toISOString();
  return { attemptId, status: "submitted", submissionReason: "manual", submittedAt: timestamp,
    result: scoreAttempt(sampleExamPaper, AttemptSchema.parse({ id: attemptId, userId: "student", paperVersionId: sampleExamPaper.id, mode: "mock", strict: true, attemptNumber: 1, startedAt: timestamp, submittedAt: timestamp, answers: [] })) };
}

describe("workspace production synchronization hooks", () => {
  it("connects a generated local identity after failed creation and submits only the server ID", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const attemptId = crypto.randomUUID();
    let creates = 0;
    const paths: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (path: string, options: RequestInit) => {
      paths.push(path);
      if (path === "/api/attempts") {
        if (++creates === 1) return Response.json({ error: "unavailable" }, { status: 503 });
        return Response.json({ attemptId, serverNow: new Date().toISOString(), deadlineAt: new Date(Date.now() + 60_000).toISOString() });
      }
      if (path.endsWith("/events")) {
        const { events } = JSON.parse(String(options.body));
        return Response.json({ acceptedEventIds: events.map((event: unknown) => AnswerEventSchema.parse(event).id), duplicateEventIds: [], eventCount: events.length });
      }
      return Response.json(serverResult(attemptId));
    }));
    const user = userEvent.setup();
    render(<ExamWorkspace mode="mock" paper={sampleExamPaper} userId="local-hook-student" />);
    await screen.findByText("Offline · saved on this device");
    await user.click(screen.getByRole("button", { name: "B. 2qa" }));
    await user.click(screen.getByRole("button", { name: "Submit test" }));
    await user.click(screen.getByRole("button", { name: "Confirm submission" }));
    await screen.findByRole("link", { name: "View results" });
    expect(creates).toBe(2);
    expect(paths.some((path) => /local[:\-]/.test(path))).toBe(false);
    expect(paths).toContain(`/api/attempts/${attemptId}/submit`);
  });

  it("does not repeatedly resynchronize while recovering a submitted server result", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const attemptId = crypto.randomUUID();
    let finish!: (response: Response) => void;
    const submission = new Promise<Response>((resolve) => { finish = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (path: string) => {
      if (path === "/api/attempts") return Response.json({ attemptId, serverNow: new Date().toISOString(), deadlineAt: new Date(Date.now() + 60_000).toISOString() });
      if (path.endsWith("/events")) return Response.json({ error: "attempt_submitted" }, { status: 409 });
      return submission;
    }));
    render(<ExamWorkspace mode="mock" paper={sampleExamPaper} userId="submitted-hook-student" />);
    await screen.findByText("Saved and synchronized");
    await userEvent.setup().click(screen.getByRole("button", { name: "B. 2qa" }));
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
    expect(saved.syncRequests).toBeLessThan(6);
    await act(async () => { finish(Response.json(serverResult(attemptId))); });
    await screen.findByRole("link", { name: "View results" });
    expect(saved.sessions.get(attemptId)?.eventQueue).toHaveLength(1);
  });
});

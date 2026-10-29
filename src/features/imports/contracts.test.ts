import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/imports/[importId]/route";
import { POST } from "@/app/api/imports/route";
import { PublishImportRequestSchema } from "@/features/imports/contracts";

describe("import API contracts", () => {
  const adminHeaders = {
    "content-type": "application/json",
    "x-medmock-user-id": "admin-current",
    "x-medmock-role": "admin",
  };

  it("requires an authenticated admin for import creation", async () => {
    const payload = JSON.stringify({
      source: {
        fileId: "file-openai",
        fileName: "neet-2025.pdf",
        mimeType: "application/pdf",
      },
      providerSelection: "both",
    });
    const unauthenticated = await POST(
      new Request("http://localhost/api/imports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: payload,
      }),
    );
    const student = await POST(
      new Request("http://localhost/api/imports", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-medmock-user-id": "student-current",
          "x-medmock-role": "student",
        },
        body: payload,
      }),
    );

    expect(unauthenticated.status).toBe(401);
    expect(student.status).toBe(403);
  });

  it("creates an import and exposes its validated status", async () => {
    const createResponse = await POST(
      new Request("http://localhost/api/imports", {
        method: "POST",
        headers: adminHeaders,
        body: JSON.stringify({
          source: {
            fileId: "file-openai",
            fileName: "neet-2025.pdf",
            mimeType: "application/pdf",
          },
          providerSelection: "both",
        }),
      }),
    );
    const created = await createResponse.json();

    expect(createResponse.status).toBe(202);
    const statusResponse = await GET(
      new Request("http://localhost/api/imports/" + created.importId, {
        headers: adminHeaders,
      }),
      { params: Promise.resolve({ importId: created.importId }) },
    );

    expect(statusResponse.status).toBe(200);
    await expect(statusResponse.json()).resolves.toEqual({
      importId: created.importId,
      status: "uploaded",
      reviewFlagCount: 0,
    });
  });

  it("requires an explicit true approval in the publish contract", () => {
    expect(
      PublishImportRequestSchema.safeParse({
        approved: false,
        paperId: "neet-2025",
        revision: 1,
      }).success,
    ).toBe(false);
  });
});

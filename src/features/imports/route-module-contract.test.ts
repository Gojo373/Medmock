import { describe, expect, it } from "vitest";

import * as publishRoute from "@/app/api/imports/[importId]/publish/route";
import * as reviewRoute from "@/app/api/imports/[importId]/review/route";
import * as workerRoute from "@/app/api/internal/imports/process/route";

describe("Next route module contracts", () => {
  it("exports only supported HTTP handlers from import route modules", () => {
    expect(Object.keys(reviewRoute).sort()).toEqual(["GET", "PATCH"]);
    expect(Object.keys(publishRoute).sort()).toEqual(["POST"]);
    expect(Object.keys(workerRoute).sort()).toEqual(["GET", "POST"]);
  });
});

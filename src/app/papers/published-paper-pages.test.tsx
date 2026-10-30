import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { sampleExamPaper } from "@/features/exam/sample-exam-paper";

const routeState = vi.hoisted(() => ({
  headers: new Headers(),
  loadPublishedPaperVersion: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => routeState.headers,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  redirect: (location: string) => {
    throw new Error(`NEXT_REDIRECT:${location}`);
  },
}));

vi.mock("@/features/papers/server/published-paper-store", () => ({
  loadPublishedPaperVersion: routeState.loadPublishedPaperVersion,
}));

import MockExamPage from "@/app/papers/[paperId]/mock/page";
import PaperDetailsPage from "@/app/papers/[paperId]/page";
import PracticeExamPage from "@/app/papers/[paperId]/practice/page";

const publishedPaper = {
  ...sampleExamPaper,
  id: "neet-reviewed-current-v2",
  paperId: "neet-reviewed",
  pattern: "current" as const,
  revision: 2,
};

beforeEach(() => {
  routeState.headers = new Headers({
    "x-medmock-user-id": "student-published",
    "x-medmock-role": "student",
  });
  routeState.loadPublishedPaperVersion.mockReset();
  routeState.loadPublishedPaperVersion.mockResolvedValue(publishedPaper);
});

describe("published paper student routes", () => {
  it("opens the selected published version from the detail page", async () => {
    render(
      await PaperDetailsPage({
        params: Promise.resolve({ paperId: publishedPaper.paperId }),
        searchParams: Promise.resolve({ version: publishedPaper.id }),
      }),
    );

    expect(routeState.loadPublishedPaperVersion).toHaveBeenCalledWith(
      publishedPaper.paperId,
      publishedPaper.id,
    );
    expect(screen.getByRole("link", { name: /start strict mock/i })).toHaveAttribute(
      "href",
      `/papers/${publishedPaper.paperId}/mock?version=${publishedPaper.id}`,
    );
    expect(screen.getByRole("link", { name: /practice with solutions/i })).toHaveAttribute(
      "href",
      `/papers/${publishedPaper.paperId}/practice?version=${publishedPaper.id}`,
    );
  });

  it("requires authentication and redacts answers before strict mock entry", async () => {
    routeState.headers = new Headers();

    await expect(
      MockExamPage({
        params: Promise.resolve({ paperId: publishedPaper.paperId }),
        searchParams: Promise.resolve({ version: publishedPaper.id }),
      }),
    ).rejects.toThrow(
      `NEXT_REDIRECT:/sign-in?next=%2Fpapers%2F${publishedPaper.paperId}%2Fmock%3Fversion%3D${publishedPaper.id}`,
    );

    routeState.headers = new Headers({
      "x-medmock-user-id": "student-published",
      "x-medmock-role": "student",
    });
    const element = await MockExamPage({
      params: Promise.resolve({ paperId: publishedPaper.paperId }),
      searchParams: Promise.resolve({ version: publishedPaper.id }),
    });

    expect(element.props.paper.id).toBe(publishedPaper.id);
    expect(element.props.paper.questions[0].acceptedOptionIds).toEqual([]);
    expect(element.props.paper.questions[0].solution).toBeUndefined();
  });

  it("passes reviewed answers and solutions into authenticated practice", async () => {
    const element = await PracticeExamPage({
      params: Promise.resolve({ paperId: publishedPaper.paperId }),
      searchParams: Promise.resolve({ version: publishedPaper.id }),
    });

    expect(element.props.paper.id).toBe(publishedPaper.id);
    expect(element.props.paper.questions[0].acceptedOptionIds).toEqual(["B"]);
    expect(element.props.paper.questions[0].solution).toBeDefined();
  });
});

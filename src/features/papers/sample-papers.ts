export type PaperSummary = {
  id: string;
  versionId?: string;
  pattern: "original" | "current";
  title: { en: string; hi?: string };
  isBilingual: boolean;
  publishedAt: string;
  questions: number;
  minutes: number;
  attempts: string;
  gradient: string;
};

export const samplePapers: PaperSummary[] = [
  {
    id: "neet-2025",
    pattern: "original",
    title: { en: "NEET 2025", hi: "नीट 2025" },
    isBilingual: true,
    publishedAt: "2025-05-04T00:00:00.000Z",
    questions: 180,
    minutes: 180,
    attempts: "18.4k",
    gradient: "paper-card--cyan",
  },
  {
    id: "neet-2024",
    pattern: "original",
    title: { en: "NEET 2024", hi: "नीट 2024" },
    isBilingual: true,
    publishedAt: "2024-05-05T00:00:00.000Z",
    questions: 200,
    minutes: 200,
    attempts: "32.1k",
    gradient: "paper-card--violet",
  },
  {
    id: "neet-2023",
    pattern: "original",
    title: { en: "NEET 2023", hi: "नीट 2023" },
    isBilingual: true,
    publishedAt: "2023-05-07T00:00:00.000Z",
    questions: 200,
    minutes: 200,
    attempts: "24.8k",
    gradient: "paper-card--mint",
  },
];

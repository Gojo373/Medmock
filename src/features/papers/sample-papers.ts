export type PaperSummary = {
  id: string;
  title: string;
  date: string;
  questions: number;
  minutes: number;
  attempts: string;
  gradient: string;
};

export const samplePapers: PaperSummary[] = [
  {
    id: "neet-2025",
    title: "NEET 2025",
    date: "04 May 2025",
    questions: 180,
    minutes: 180,
    attempts: "18.4k",
    gradient: "paper-card--cyan",
  },
  {
    id: "neet-2024",
    title: "NEET 2024",
    date: "05 May 2024",
    questions: 200,
    minutes: 200,
    attempts: "32.1k",
    gradient: "paper-card--violet",
  },
  {
    id: "neet-2023",
    title: "NEET 2023",
    date: "07 May 2023",
    questions: 200,
    minutes: 200,
    attempts: "24.8k",
    gradient: "paper-card--mint",
  },
];

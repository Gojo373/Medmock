import { notFound } from "next/navigation";

import { ExamWorkspace } from "@/features/exam/exam-workspace";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";

export default async function PracticeExamPage({
  params,
}: {
  params: Promise<{ paperId: string }>;
}) {
  const { paperId } = await params;
  if (paperId !== sampleExamPaper.paperId) notFound();

  return <ExamWorkspace mode="practice" paper={sampleExamPaper} />;
}

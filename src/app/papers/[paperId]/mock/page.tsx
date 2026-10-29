import { notFound } from "next/navigation";

import { ExamWorkspace } from "@/features/exam/exam-workspace";
import { redactPaperForStrictMock } from "@/features/exam/public-paper";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";

export default async function MockExamPage({
  params,
}: {
  params: Promise<{ paperId: string }>;
}) {
  const { paperId } = await params;
  if (paperId !== sampleExamPaper.paperId) notFound();

  return (
    <ExamWorkspace
      mode="mock"
      paper={redactPaperForStrictMock(sampleExamPaper)}
    />
  );
}

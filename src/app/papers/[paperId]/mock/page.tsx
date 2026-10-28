import { ExamWorkspace } from "@/features/exam/exam-workspace";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";

export default function MockExamPage() {
  return <ExamWorkspace mode="mock" paper={sampleExamPaper} />;
}

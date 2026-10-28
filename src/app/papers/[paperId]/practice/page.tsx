import { ExamWorkspace } from "@/features/exam/exam-workspace";
import { sampleExamPaper } from "@/features/exam/sample-exam-paper";

export default function PracticeExamPage() {
  return <ExamWorkspace mode="practice" paper={sampleExamPaper} />;
}

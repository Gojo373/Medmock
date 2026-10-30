import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { ExamWorkspace } from "@/features/exam/exam-workspace";
import { loadPublishedPaperVersion } from "@/features/papers/server/published-paper-store";
import { getRequestUser } from "@/lib/auth/server-auth";

export default async function PracticeExamPage({
  params,
  searchParams,
}: {
  params: Promise<{ paperId: string }>;
  searchParams: Promise<{ version?: string | string[] }>;
}) {
  const { paperId } = await params;
  const version = (await searchParams).version;
  if (Array.isArray(version)) notFound();
  const paper = await loadPublishedPaperVersion(paperId, version);
  if (!paper) notFound();

  const destination = `/papers/${paperId}/practice?version=${encodeURIComponent(paper.id)}`;
  const requestHeaders = await headers();
  const user = await getRequestUser(
    new Request(`http://localhost${destination}`, { headers: requestHeaders }),
  );
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(destination)}`);

  return <ExamWorkspace mode="practice" paper={paper} userId={user.id} />;
}

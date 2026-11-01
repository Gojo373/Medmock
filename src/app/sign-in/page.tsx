import { SignInShell } from "@/features/auth/sign-in-shell";
import { safeReturnDestination } from "@/lib/auth/return-destination";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return <SignInShell next={safeReturnDestination(next)} />;
}

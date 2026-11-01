"use client";

import Link from "next/link";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { AuthPanel } from "@/features/auth/auth-panel";
import { useLocale } from "@/features/localization/locale-provider";

export function SignInShell() {
  const { toggleLocale, copy, locale } = useLocale();
  return <main className="auth-page">
    <div aria-hidden="true" className="aurora aurora--one" />
    <Link aria-label={locale === "hi" ? "MedMock मुख्य पृष्ठ" : "MedMock home"} className="auth-page__brand" href="/"><BrandMark /></Link>
    <Button className="auth-language" onClick={toggleLocale} tone="ghost">{copy.languageSwitch}</Button>
    <AuthPanel />
  </main>;
}

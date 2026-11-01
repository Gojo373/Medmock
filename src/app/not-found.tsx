"use client";

import { SearchX } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";
import { useLocale } from "@/features/localization/locale-provider";

export default function NotFoundPage() {
  const { locale } = useLocale();
  const hindi = locale === "hi";
  return (
    <main className="status-page">
      <Link aria-label={hindi ? "MedMock मुख्य पृष्ठ" : "MedMock home"} href="/">
        <BrandMark />
      </Link>
      <section className="status-card">
        <SearchX aria-hidden="true" />
        <p className="eyebrow">{hindi ? "404 · नहीं मिला" : "404 · Not found"}</p>
        <h1>{hindi ? "यह पेपर लाइब्रेरी में नहीं है।" : "This paper is not in the library."}</h1>
        <p>{hindi ? "यह लिंक पुराना, निजी या अब अनुपलब्ध हो सकता है।" : "The link may be outdated, private, or no longer available."}</p>
        <Link className="button button--primary" href="/">
          {hindi ? "समीक्षित पेपर देखें" : "Browse reviewed papers"}
        </Link>
      </section>
    </main>
  );
}

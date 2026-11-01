"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/features/localization/locale-provider";

export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const { locale } = useLocale();
  const hindi = locale === "hi";
  useEffect(() => {
    console.error("MedMock page error", {
      digest: error instanceof Error && "digest" in error ? error.digest : undefined,
      message: error instanceof Error ? error.message : "Unknown page error",
    });
  }, [error]);

  return (
    <main className="status-page">
      <Link aria-label={hindi ? "MedMock मुख्य पृष्ठ" : "MedMock home"} href="/">
        <BrandMark />
      </Link>
      <section className="status-card" role="alert">
        <AlertTriangle aria-hidden="true" />
        <p className="eyebrow">{hindi ? "कुछ गड़बड़ हो गई" : "Something went wrong"}</p>
        <h1>{hindi ? "यह स्क्रीन लोड नहीं हो सकी।" : "We could not load this screen safely."}</h1>
        <p>
          {hindi ? "आपके सहेजे गए प्रयास सुरक्षित हैं। फिर प्रयास करें या पेपर लाइब्रेरी पर लौटें।" : "Your saved attempt data is not changed. Retry this screen or return to the paper library."}
        </p>
        <div>
          <Button onClick={retry}>
            <RefreshCw aria-hidden="true" size={17} /> {hindi ? "फिर प्रयास करें" : "Retry"}
          </Button>
          <Link className="button button--secondary" href="/">
            {hindi ? "पेपर लाइब्रेरी" : "Paper library"}
          </Link>
        </div>
      </section>
    </main>
  );
}

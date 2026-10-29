"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("MedMock page error", {
      digest: error.digest,
      message: error.message,
    });
  }, [error]);

  return (
    <main className="status-page">
      <Link aria-label="MedMock home" href="/">
        <BrandMark />
      </Link>
      <section className="status-card" role="alert">
        <AlertTriangle aria-hidden="true" />
        <p className="eyebrow">Something went wrong</p>
        <h1>We could not load this screen safely.</h1>
        <p>
          Your saved attempt data is not changed. Retry this screen or return
          to the paper library.
        </p>
        <div>
          <Button onClick={reset}>
            <RefreshCw aria-hidden="true" size={17} /> Retry
          </Button>
          <Link className="button button--secondary" href="/">
            Paper library
          </Link>
        </div>
      </section>
    </main>
  );
}

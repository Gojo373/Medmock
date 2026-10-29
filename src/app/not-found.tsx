import { SearchX } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";

export default function NotFoundPage() {
  return (
    <main className="status-page">
      <Link aria-label="MedMock home" href="/">
        <BrandMark />
      </Link>
      <section className="status-card">
        <SearchX aria-hidden="true" />
        <p className="eyebrow">404 · Not found</p>
        <h1>This paper is not in the library.</h1>
        <p>The link may be outdated, private, or no longer available.</p>
        <Link className="button button--primary" href="/">
          Browse reviewed papers
        </Link>
      </section>
    </main>
  );
}

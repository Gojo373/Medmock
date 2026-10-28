import Link from "next/link";

import { BrandMark } from "@/components/brand/brand-mark";
import { AuthPanel } from "@/features/auth/auth-panel";
import { LocaleProvider } from "@/features/localization/locale-provider";

export default function SignInPage() {
  return (
    <LocaleProvider>
      <main className="auth-page">
        <div aria-hidden="true" className="aurora aurora--one" />
        <Link aria-label="MedMock home" className="auth-page__brand" href="/">
          <BrandMark />
        </Link>
        <AuthPanel />
      </main>
    </LocaleProvider>
  );
}

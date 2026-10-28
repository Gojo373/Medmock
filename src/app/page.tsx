import { LandingPage } from "@/features/landing/landing-page";
import { LocaleProvider } from "@/features/localization/locale-provider";

export default function HomePage() {
  return (
    <LocaleProvider>
      <LandingPage />
    </LocaleProvider>
  );
}

import { LandingPage } from "@/features/landing/landing-page";
import { LocaleProvider } from "@/features/localization/locale-provider";
import { loadPublishedPaperLibrary } from "@/features/papers/server/published-paper-store";

export default async function HomePage() {
  const papers = await loadPublishedPaperLibrary();

  return (
    <LocaleProvider>
      <LandingPage papers={papers} />
    </LocaleProvider>
  );
}

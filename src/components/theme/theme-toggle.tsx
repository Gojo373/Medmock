"use client";

import { MoonStar, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/features/localization/locale-provider";

export function ThemeToggle() {
  const { locale } = useLocale();
  const [dark, setDark] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("medmock-theme") === "dark",
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  function toggleTheme() {
    setDark((current) => {
      const next = !current;
      document.documentElement.classList.toggle("dark", next);
      window.localStorage.setItem("medmock-theme", next ? "dark" : "light");
      return next;
    });
  }

  return (
    <Button
      aria-label={locale === "hi"
        ? dark ? "हल्की थीम चुनें" : "गहरी थीम चुनें"
        : dark ? "Switch to light theme" : "Switch to dark theme"}
      className="icon-button"
      onClick={toggleTheme}
      tone="ghost"
    >
      {dark ? <Sun aria-hidden="true" size={18} /> : <MoonStar aria-hidden="true" size={18} />}
    </Button>
  );
}

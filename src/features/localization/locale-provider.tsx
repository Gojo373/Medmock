"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

import { messages, type Locale } from "@/features/localization/messages";

type LocaleContextValue = {
  locale: Locale;
  copy: (typeof messages)[Locale];
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  children,
  initialLocale = "en",
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const value = useMemo(
    () => ({
      locale,
      copy: messages[locale],
      setLocale,
      toggleLocale: () => setLocale((current) => (current === "en" ? "hi" : "en")),
    }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);

  if (!context) {
    throw new Error("useLocale must be used inside LocaleProvider");
  }

  return context;
}

"use client";

import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { messages, type Locale } from "@/features/localization/messages";

type LocaleContextValue = {
  locale: Locale;
  copy: (typeof messages)[Locale];
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const storageKey = "medmock-locale";
const changeEvent = "medmock-locale-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(changeEvent, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(changeEvent, onChange);
  };
}

function readLocale(fallback: Locale): Locale {
  try {
    const stored = window.localStorage.getItem(storageKey);
    return stored === "en" || stored === "hi" ? stored : fallback;
  } catch {
    return fallback;
  }
}

export function LocaleProvider({
  children,
  initialLocale = "en",
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [memoryLocale, setMemoryLocale] = useState<Locale>();
  const storedLocale = useSyncExternalStore(
    subscribe,
    () => readLocale(initialLocale),
    () => initialLocale,
  );
  const locale = memoryLocale ?? storedLocale;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(
    () => {
      const setLocale = (next: Locale) => {
        try {
          window.localStorage.setItem(storageKey, next);
          setMemoryLocale(undefined);
        } catch {
          setMemoryLocale(next);
        }
        window.dispatchEvent(new Event(changeEvent));
      };
      return {
        locale,
        copy: messages[locale],
        setLocale,
        toggleLocale: () => setLocale(locale === "en" ? "hi" : "en"),
      };
    },
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

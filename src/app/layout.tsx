import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/features/localization/locale-provider";

import "@/app/globals.css";

export const metadata: Metadata = {
  title: "MedMock | NEET papers in CBT mode",
  description:
    "Practice reviewed NEET papers in a resilient bilingual CBT experience with verified solutions and deep analytics.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body><LocaleProvider>{children}</LocaleProvider></body>
    </html>
  );
}

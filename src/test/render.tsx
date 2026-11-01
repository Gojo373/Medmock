import { render as renderComponent, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { LocaleProvider } from "@/features/localization/locale-provider";

export function render(ui: ReactElement, options?: RenderOptions) {
  return renderComponent(ui, {
    wrapper: ({ children }: { children: ReactNode }) => <LocaleProvider>{children}</LocaleProvider>,
    ...options,
  });
}

import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/cn";

type ButtonProps = ComponentProps<"button"> & {
  children: ReactNode;
  tone?: "primary" | "secondary" | "ghost";
};

export function Button({
  children,
  className,
  tone = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn("button", `button--${tone}`, className)}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}

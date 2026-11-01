"use client";

import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { useLocale } from "@/features/localization/locale-provider";
import { safeReturnDestination } from "@/lib/auth/return-destination";

export function AuthPanel({ next }: { next?: string }) {
  const destination = next === undefined ? undefined : safeReturnDestination(next);
  const id = useId();
  const { copy, locale } = useLocale();
  const [status, setStatus] = useState<"error" | "idle" | "loading" | "sent">("idle");

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();

    if (!email) {
      setStatus("error");
      return;
    }

    setStatus("loading");

    try {
      const response = await fetch("/api/auth/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, ...(destination ? { next: destination } : {}) }),
      });

      setStatus(response.ok ? "sent" : "error");
    } catch {
      setStatus("error");
    }
  }

  return (
    <GlassPanel className="auth-panel">
      <div className="auth-panel__shield"><ShieldCheck aria-hidden="true" /></div>
      <p className="eyebrow">{copy.auth.eyebrow}</p>
      <h1>{copy.auth.title}</h1>
      <p className="auth-panel__description">{copy.auth.description}</p>
      <a
        className="auth-panel__google button button--secondary"
        href={destination ? `/api/auth/google?next=${encodeURIComponent(destination)}` : "/api/auth/google"}
      >
        <span aria-hidden="true" className="google-mark">G</span>
        {copy.auth.google}
      </a>
      <div className="auth-panel__divider"><span>{copy.auth.divider}</span></div>
      <form className="auth-panel__form" onSubmit={requestOtp}>
        <label htmlFor={id}>{copy.auth.email}</label>
        <div className="input-shell">
          <Mail aria-hidden="true" size={18} />
          <input
            autoComplete="email"
            id={id}
            name="email"
            placeholder={copy.auth.placeholder}
            required
            type="email"
          />
        </div>
        <Button disabled={status === "loading"} type="submit">
          {status === "loading"
            ? locale === "en" ? "Sending…" : "भेज रहे हैं…"
            : copy.auth.submit}
          <ArrowRight aria-hidden="true" size={17} />
        </Button>
      </form>
      {status !== "idle" && status !== "loading" && (
        <p
          className={`auth-panel__status auth-panel__status--${status}`}
          role="status"
        >
          {status === "sent"
            ? locale === "en"
              ? "Check your email for the secure sign-in link."
              : "सुरक्षित साइन-इन लिंक के लिए अपना ईमेल देखें।"
            : locale === "en"
              ? "Sign-in is unavailable right now. Please try again."
              : "साइन-इन अभी उपलब्ध नहीं है। कृपया फिर प्रयास करें।"}
        </p>
      )}
      <p className="auth-panel__terms">{copy.auth.terms}</p>
    </GlassPanel>
  );
}

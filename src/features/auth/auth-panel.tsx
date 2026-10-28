"use client";

import { ArrowRight, Mail, ShieldCheck } from "lucide-react";
import { useId } from "react";

import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/glass-panel";
import { useLocale } from "@/features/localization/locale-provider";

export function AuthPanel() {
  const id = useId();
  const { copy } = useLocale();

  return (
    <GlassPanel className="auth-panel">
      <div className="auth-panel__shield"><ShieldCheck aria-hidden="true" /></div>
      <p className="eyebrow">{copy.auth.eyebrow}</p>
      <h1>{copy.auth.title}</h1>
      <p className="auth-panel__description">{copy.auth.description}</p>
      <Button className="auth-panel__google" tone="secondary">
        <span aria-hidden="true" className="google-mark">G</span>
        {copy.auth.google}
      </Button>
      <div className="auth-panel__divider"><span>{copy.auth.divider}</span></div>
      <form className="auth-panel__form">
        <label htmlFor={id}>{copy.auth.email}</label>
        <div className="input-shell">
          <Mail aria-hidden="true" size={18} />
          <input id={id} name="email" placeholder={copy.auth.placeholder} type="email" />
        </div>
        <Button type="submit">
          {copy.auth.submit}
          <ArrowRight aria-hidden="true" size={17} />
        </Button>
      </form>
      <p className="auth-panel__terms">{copy.auth.terms}</p>
    </GlassPanel>
  );
}

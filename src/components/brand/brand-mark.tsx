import { cn } from "@/lib/cn";

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={cn("brand-mark", compact && "brand-mark--compact")}>
      <svg
        aria-hidden="true"
        className="brand-mark__icon"
        viewBox="0 0 48 48"
      >
        <defs>
          <linearGradient id="medmock-mark" x1="6" x2="42" y1="4" y2="44">
            <stop offset="0" stopColor="#22d3ee" />
            <stop offset=".52" stopColor="#6d7cff" />
            <stop offset="1" stopColor="#a56bff" />
          </linearGradient>
        </defs>
        <path
          d="M11 35V13.5c0-2 2.4-3 3.8-1.6L24 21l9.2-9.1c1.4-1.4 3.8-.4 3.8 1.6V35"
          fill="none"
          stroke="url(#medmock-mark)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="6"
        />
        <path d="m18 32 5 5 9-11" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" />
      </svg>
      <span className="brand-mark__word">MedMock</span>
    </span>
  );
}

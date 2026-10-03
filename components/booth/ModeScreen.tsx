"use client";

import { BracketButton, TertiaryLogo } from "@/components/brand/Brand";
import { printLayout, type PrintMode } from "@/lib/print/layouts";
import { BoothScreen } from "./Scene";

/** Miniature of the printed sheet, drawn from the real print geometry. */
export function PrintDiagram({
  mode,
  className,
  sheet = "#FFFFFF",
  cell = "#101A21",
}: {
  mode: PrintMode;
  className?: string;
  sheet?: string;
  cell?: string;
}) {
  const layout = printLayout(mode);
  const { width: W, height: H } = layout;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden>
      <rect width={W} height={H} rx={40} fill={sheet} />
      {layout.panels.flatMap((p, pi) => [
        ...p.cells.map((c, i) => (
          <rect key={`${pi}-${i}`} x={c.x} y={c.y} width={c.w} height={c.h} rx={layout.radius * 2} fill={cell} opacity={0.85} />
        )),
        <rect
          key={`${pi}-f`}
          x={p.brand.x + (p.brandSide === "right" ? p.brand.w * 0.15 : 0)}
          y={p.brand.y + (p.brandSide === "right" ? 0 : p.brand.h * 0.3)}
          width={p.brandSide === "right" ? p.brand.w * 0.7 : p.brand.w * 0.45}
          height={50}
          rx={25}
          fill={cell}
          opacity={0.35}
        />,
      ])}
      {layout.cuts.map((x) => (
        <line key={x} x1={x} x2={x} y1={0} y2={H} stroke={cell} strokeWidth={6} strokeDasharray="28 22" opacity={0.4} />
      ))}
    </svg>
  );
}

const OPTIONS: { mode: PrintMode; title: string; blurb: string; card: string; sheet: string }[] = [
  {
    mode: "strip",
    title: "Two Strips",
    blurb: "4 shots, printed twice — a strip for you and one for a friend",
    card: "bg-sh-blue text-sh-white",
    sheet: "#ECECEF",
  },
  {
    mode: "grid",
    title: "Full Frame",
    blurb: "4 big landscape shots in a 2 × 2 grid on one 6 × 4 print",
    card: "bg-sh-orange text-sh-black",
    sheet: "#ECECEF",
  },
];

/** Seconds of countdown before each photo. */
export const DELAYS = [3, 5, 10] as const;
export const DEFAULT_DELAY = 5;

export default function ModeScreen({
  delay,
  onDelay,
  onPick,
  onBack,
}: {
  delay: number;
  onDelay: (seconds: number) => void;
  onPick: (mode: PrintMode) => void;
  onBack: () => void;
}) {
  return (
    <BoothScreen className="flex flex-col bg-sh-white px-[1.5rem] pb-[1.25rem] pt-[1.25rem] text-sh-black">
      <header className="flex items-start justify-between">
        <h1>
          <span className="block text-[1.6rem] font-normal leading-none tracking-[-0.02em]">Pick Your</span>
          <span className="type-display block text-[2.6rem]">Print</span>
        </h1>
        <div className="flex items-center gap-[1rem]">
          <div className="flex items-center gap-[0.45rem]" role="radiogroup" aria-label="Time between photos">
            <span className="mr-[0.2rem] text-[0.85rem] font-semibold uppercase leading-tight tracking-[0.12em] text-sh-black/60">
              Time between
              <br />
              photos
            </span>
            {DELAYS.map((s) => {
              const on = s === delay;
              return (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-delay={s}
                  onClick={() => onDelay(s)}
                  className={`flex min-h-[2.75rem] items-center gap-[0.45rem] rounded-[0.8rem] px-[0.75rem] text-[0.95rem] font-semibold transition-colors ${
                    on ? "bg-sh-black text-sh-white" : "bg-sh-black/[0.06] text-sh-black"
                  }`}
                >
                  <span
                    className={`flex size-[1.1rem] shrink-0 items-center justify-center rounded-[0.3rem] text-[0.8rem] leading-none ${
                      on ? "bg-sh-white text-sh-black" : "ring-2 ring-inset ring-sh-black/40"
                    }`}
                    aria-hidden
                  >
                    {on ? "✓" : ""}
                  </span>
                  {s}s
                </button>
              );
            })}
          </div>
          <BracketButton variant="secondary" onClick={onBack}>
            Back
          </BracketButton>
        </div>
      </header>

      <div className="mt-[1rem] grid min-h-0 flex-1 grid-cols-2 gap-[1rem]">
        {OPTIONS.map((o) => (
          <button
            key={o.mode}
            type="button"
            data-mode={o.mode}
            onClick={() => onPick(o.mode)}
            className={`group relative flex min-h-0 flex-col gap-[0.9rem] overflow-hidden rounded-card p-[1.25rem] text-left transition-transform duration-150 active:scale-[0.98] ${o.card}`}
          >
            <span className="flex min-h-0 flex-1 items-center justify-center">
              <PrintDiagram mode={o.mode} sheet={o.sheet} className="h-full max-h-full w-full" />
            </span>
            <span className="flex items-end justify-between gap-[1rem]">
              <span className="flex min-w-0 flex-col gap-[0.35rem]">
                <span className="type-display text-[2.1rem]">{o.title}</span>
                <span className="text-[0.9rem] font-medium leading-snug opacity-85">{o.blurb}</span>
              </span>
              <span className="type-display shrink-0 text-[1.3rem]">[ Choose ]</span>
            </span>
          </button>
        ))}
      </div>

      <TertiaryLogo className="mt-[0.9rem] h-[1rem] text-sh-black" />
    </BoothScreen>
  );
}

"use client";

import { BracketButton, TertiaryLogo } from "@/components/brand/Brand";
import { printLayout, SHEET_H, SHEET_W, type PrintMode } from "@/lib/print/layouts";
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
  return (
    <svg viewBox={`0 0 ${SHEET_W} ${SHEET_H}`} className={className} aria-hidden>
      <rect width={SHEET_W} height={SHEET_H} rx={40} fill={sheet} />
      {layout.panels.flatMap((p, pi) => [
        ...p.cells.map((c, i) => (
          <rect key={`${pi}-${i}`} x={c.x} y={c.y} width={c.w} height={c.h} rx={layout.radius * 2} fill={cell} opacity={0.85} />
        )),
        <rect
          key={`${pi}-f`}
          x={p.footer.x}
          y={p.footer.y + p.footer.h * 0.3}
          width={p.footer.w * 0.45}
          height={p.footer.h * 0.22}
          rx={p.footer.h * 0.11}
          fill={cell}
          opacity={0.35}
        />,
      ])}
      {layout.cuts.map((x) => (
        <line key={x} x1={x} x2={x} y1={0} y2={SHEET_H} stroke={cell} strokeWidth={6} strokeDasharray="28 22" opacity={0.4} />
      ))}
    </svg>
  );
}

const OPTIONS: { mode: PrintMode; title: string; blurb: string; card: string; sheet: string }[] = [
  {
    mode: "strip",
    title: "Two Strips",
    blurb: "4 landscape shots, printed twice — one strip for you, one for a friend",
    card: "bg-sh-blue text-sh-white",
    sheet: "#ECECEF",
  },
  {
    mode: "grid",
    title: "Full Frame",
    blurb: "4 portrait shots in a big 2 × 2 grid on one 4 × 6 print",
    card: "bg-sh-orange text-sh-black",
    sheet: "#ECECEF",
  },
];

export default function ModeScreen({
  onPick,
  onBack,
}: {
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
        <BracketButton variant="secondary" onClick={onBack}>
          Back
        </BracketButton>
      </header>

      <div className="mt-[1rem] grid min-h-0 flex-1 grid-cols-2 gap-[1rem]">
        {OPTIONS.map((o) => (
          <button
            key={o.mode}
            type="button"
            data-mode={o.mode}
            onClick={() => onPick(o.mode)}
            className={`group relative flex min-h-0 items-center gap-[1.25rem] overflow-hidden rounded-card p-[1.25rem] text-left transition-transform duration-150 active:scale-[0.98] ${o.card}`}
          >
            <PrintDiagram mode={o.mode} sheet={o.sheet} className="h-full max-h-[22rem] w-auto shrink-0" />
            <span className="flex min-w-0 flex-col gap-[0.6rem]">
              <span className="type-display text-[2.3rem]">{o.title}</span>
              <span className="text-[0.95rem] font-medium leading-snug opacity-85">{o.blurb}</span>
              <span className="type-display mt-[0.4rem] text-[1.3rem]">[ Choose ]</span>
            </span>
          </button>
        ))}
      </div>

      <TertiaryLogo className="mt-[0.9rem] h-[1rem] text-sh-black" />
    </BoothScreen>
  );
}

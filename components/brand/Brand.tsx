import type { CSSProperties, ReactNode } from "react";
import type { BrandShape } from "@/lib/brand/shapes";
import { logoPrimary, logoTertiary, star } from "@/lib/brand/shapes";
import {
  MATRIX_LABEL,
  MATRIX_LABEL_SIZE,
  MATRIX_STAR,
  type Matrix,
} from "@/lib/brand/matrix";

/** A single-colour brand shape (logo, loop, star) drawn in `currentColor`. */
export function Shape({
  shape,
  className,
  style,
  title,
}: {
  shape: BrandShape;
  className?: string;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <svg
      viewBox={`${shape.x} ${shape.y} ${shape.w} ${shape.h}`}
      className={className}
      style={{ aspectRatio: `${shape.w} / ${shape.h}`, ...style }}
      fill="currentColor"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {shape.paths.map((p, i) => (
        <path key={i} d={p.d} fillRule={p.evenodd ? "evenodd" : undefined} />
      ))}
    </svg>
  );
}

/** Primary logo `( ⚡ ) [ StormHacks 26’ ];` — size it by height. */
export function Logo({ className }: { className?: string }) {
  return <Shape shape={logoPrimary} className={className} title="StormHacks 26’" />;
}

/** Tertiary logo `( ⚡ ) [ SH 26’ ];` for corners. */
export function TertiaryLogo({ className }: { className?: string }) {
  return <Shape shape={logoTertiary} className={className} title="SH 26’" />;
}

/** Illustration file in public/brand/ without extension, e.g. "otter-pink". */
export type OtterName = string;

/** Surge otter illustration (transparent PNG cut from the brand posts). */
export function Otter({
  name,
  className,
  style,
}: {
  name: OtterName;
  className?: string;
  style?: CSSProperties;
}) {
  // eslint-disable-next-line @next/next/no-img-element
  return (
    <img
      src={`/brand/${name}.png`}
      alt=""
      draggable={false}
      className={className}
      style={style}
    />
  );
}

/** GrainFut texture overlay. Parent must be `relative`. */
export function Grain() {
  return <div className="grain" aria-hidden />;
}

/** "West Canada's Largest Hackathon ✺ Oct 3 + 4 ✺ SFU Burnaby". */
export function Tagline({ className }: { className?: string }) {
  const Star = () => <Shape shape={star} className="mx-[0.5em] inline-block h-[0.9em] align-[-0.1em]" />;
  return (
    <p className={`font-body ${className ?? ""}`}>
      West Canada’s Largest Hackathon
      <Star />
      Oct 3 + 4
      <Star />
      SFU Burnaby
    </p>
  );
}

/** Two-level short headline lock-up: L1 Inter regular, L2 display. */
export function Headline({
  line1,
  line2,
  className,
}: {
  line1: ReactNode;
  line2: ReactNode;
  className?: string;
}) {
  return (
    <h1 className={className}>
      <span className="block font-body font-normal leading-none tracking-[-0.02em]">{line1}</span>
      <span className="type-display block">{line2}</span>
    </h1>
  );
}

type BracketVariant = "primary" | "secondary" | "inverse";

const BRACKET_STYLES: Record<BracketVariant, string> = {
  primary: "bg-sh-black text-sh-white",
  inverse: "bg-sh-white text-sh-black",
  secondary: "bg-transparent text-current ring-[0.15rem] ring-inset ring-current",
};

/** CTA in brackets — `[ Print ]` — the brand's button. */
export function BracketButton({
  children,
  variant = "primary",
  size = "md",
  className,
  ...rest
}: {
  children: ReactNode;
  variant?: BracketVariant;
  size?: "md" | "lg";
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const sizing =
    size === "lg"
      ? "min-h-[4rem] px-[1.6rem] text-[2rem]"
      : "min-h-[3rem] px-[1.2rem] text-[1.4rem]";
  return (
    <button
      type="button"
      {...rest}
      className={`type-display touch-none-select inline-flex items-center justify-center gap-[0.35em] whitespace-nowrap rounded-card transition-[transform,opacity] duration-150 active:scale-[0.97] disabled:opacity-40 ${sizing} ${BRACKET_STYLES[variant]} ${className ?? ""}`}
    >
      <span aria-hidden>[</span>
      <span>{children}</span>
      <span aria-hidden>]</span>
    </button>
  );
}

/** Code matrix: dot cluster in one colour, `{i++;}` labels in another. */
export function CodeMatrix({
  matrix = MATRIX_STAR,
  dotColor,
  labelColor,
  className,
  style,
}: {
  matrix?: Matrix;
  dotColor: string;
  labelColor: string;
  className?: string;
  style?: CSSProperties;
}) {
  const { minX, minY, maxX, maxY } = matrix;
  const w = maxX - minX;
  const h = maxY - minY;
  return (
    <svg
      viewBox={`${minX} ${minY} ${w} ${h}`}
      className={className}
      style={{ aspectRatio: `${w} / ${h}`, ...style }}
      aria-hidden
    >
      {matrix.dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={dotColor} />
      ))}
      {matrix.labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          fill={labelColor}
          fontSize={MATRIX_LABEL_SIZE}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-display"
          fontWeight={800}
        >
          {MATRIX_LABEL}
        </text>
      ))}
    </svg>
  );
}

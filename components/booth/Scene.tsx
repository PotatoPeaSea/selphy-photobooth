import type { ReactNode } from "react";
import { Grain, Otter, Shape, type OtterName } from "@/components/brand/Brand";
import { MATRIX_STAR } from "@/lib/brand/matrix";
import { CodeMatrix } from "@/components/brand/Brand";
import {
  braceClose,
  braceOpen,
  bracketClose,
  bracketOpen,
} from "@/lib/brand/shapes";

/** Full-screen booth page; `booth-root` turns on screen-relative rem sizing. */
export function BoothScreen({
  className,
  grain = false,
  children,
  ...rest
}: {
  className?: string;
  grain?: boolean;
  children: ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <main
      {...rest}
      className={`booth-root touch-none-select relative h-dvh w-full overflow-hidden ${className ?? ""}`}
    >
      {children}
      {grain && <Grain />}
    </main>
  );
}

export type SceneFrame = "brackets" | "braces" | "matrix";

/**
 * An otter rising from the bottom edge, framed by dynamic loops (opener
 * behind, closer in front) or a code matrix — the brand's portrait treatment.
 * Fills its (relative, sized) parent.
 */
export function OtterScene({
  otter,
  frame,
  loopColor = "#FFFFFF",
  matrixColors = { dot: "#FF5D0B", label: "#101A21" },
  className,
}: {
  otter: OtterName;
  frame: SceneFrame;
  loopColor?: string;
  matrixColors?: { dot: string; label: string };
  className?: string;
}) {
  const fullBody = otter === "sparky";
  const [open, close] = frame === "braces" ? [braceOpen, braceClose] : [bracketOpen, bracketClose];
  return (
    <div className={`pointer-events-none absolute inset-0 ${className ?? ""}`} aria-hidden>
      {frame === "matrix" ? (
        <CodeMatrix
          matrix={MATRIX_STAR}
          dotColor={matrixColors.dot}
          labelColor={matrixColors.label}
          className="absolute left-0 top-[30%] w-[50%]"
        />
      ) : (
        <Shape shape={open} className="absolute left-0 top-[26%] w-[52%]" style={{ color: loopColor }} />
      )}
      {/* The PNGs are larger than any slot, so max-* scales them down proportionally. */}
      <Otter
        name={otter}
        className={`absolute left-[56%] max-h-[80%] max-w-[78%] -translate-x-1/2 ${fullBody ? "bottom-[3%]" : "bottom-0"}`}
      />
      {frame !== "matrix" && (
        <Shape shape={close} className="absolute bottom-[10%] right-0 w-[46%]" style={{ color: loopColor }} />
      )}
    </div>
  );
}

import type { ReactNode } from "react";
import { Grain, Otter, Shape, type OtterName } from "@/components/brand/Brand";
import { MATRIX_STAR } from "@/lib/brand/matrix";
import { CodeMatrix } from "@/components/brand/Brand";
import {
  braceClose,
  braceOpen,
  bracketClose,
  bracketOpen,
  star,
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

const BURST = [
  { dx: "-12rem", dy: "-7rem", size: "4.2rem" },
  { dx: "-5rem", dy: "-13rem", size: "2.8rem" },
  { dx: "4rem", dy: "-14rem", size: "3.8rem" },
  { dx: "12rem", dy: "-6rem", size: "3rem" },
  { dx: "13rem", dy: "2rem", size: "2.2rem" },
  { dx: "-13rem", dy: "1rem", size: "2.4rem" },
];

/** Brand stars flying out from the otter's head on a tap. */
function StarBurst({ color }: { color: string }) {
  return (
    <div className="absolute left-1/2 top-[22%]">
      {BURST.map((b, i) => (
        <Shape
          key={i}
          shape={star}
          className="absolute -translate-x-1/2 -translate-y-1/2 animate-burst"
          style={
            {
              width: b.size,
              color: i % 2 ? color : "#F9B200",
              "--dx": b.dx,
              "--dy": b.dy,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

export type SceneFrame = "brackets" | "braces" | "matrix";

/**
 * An otter rising from the bottom edge, framed by dynamic loops (opener
 * behind, closer in front) or a code matrix — the brand's portrait treatment.
 * Fills its (relative, sized) parent. With `onTap` the otter itself is
 * tappable; bump `tapCount` to replay the bounce and star burst.
 */
export function OtterScene({
  otter,
  frame,
  loopColor = "#FFFFFF",
  matrixColors = { dot: "#FF5D0B", label: "#101A21" },
  className,
  onTap,
  tapCount = 0,
}: {
  otter: OtterName;
  frame: SceneFrame;
  loopColor?: string;
  matrixColors?: { dot: string; label: string };
  className?: string;
  onTap?: () => void;
  tapCount?: number;
}) {
  const fullBody = otter === "otter-sparky";
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
      <div
        className={`absolute left-[56%] flex h-[80%] w-[78%] -translate-x-1/2 items-end justify-center ${fullBody ? "bottom-[3%]" : "bottom-0"}`}
      >
        <Otter
          key={tapCount}
          name={otter}
          className={`max-h-full max-w-full origin-bottom ${onTap ? "pointer-events-auto cursor-pointer" : ""} ${tapCount > 0 ? "animate-boing" : ""}`}
          onPointerDown={
            onTap &&
            ((e) => {
              e.stopPropagation();
              onTap();
            })
          }
        />
        {tapCount > 0 && <StarBurst key={`burst-${tapCount}`} color={loopColor} />}
      </div>
      {frame !== "matrix" && (
        <Shape shape={close} className="absolute bottom-[10%] right-0 w-[46%]" style={{ color: loopColor }} />
      )}
    </div>
  );
}

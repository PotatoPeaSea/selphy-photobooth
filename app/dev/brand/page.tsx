import {
  BracketButton,
  CodeMatrix,
  Grain,
  Headline,
  Logo,
  Otter,
  Shape,
  Tagline,
  TertiaryLogo,
} from "@/components/brand/Brand";
import { MATRIX_SPRAY } from "@/lib/brand/matrix";
import { bracketClose, bracketOpen, braceClose, braceOpen } from "@/lib/brand/shapes";

/** Temporary brand primitives sheet (removed in cleanup). */
export default function BrandSheet() {
  return (
    <main className="booth-root grid h-dvh grid-cols-3 grid-rows-2 overflow-hidden">
      <section className="relative overflow-hidden bg-sh-blue p-[1rem] text-sh-white">
        <Tagline className="text-[0.75rem]" />
        <Headline line1="Snap With" line2="StormHacks" className="mt-[1rem] text-[3rem]" />
        <BracketButton variant="inverse" className="mt-[1rem]">Skip Scan</BracketButton>
        <TertiaryLogo className="absolute bottom-[1rem] left-[1rem] h-[1rem]" />
        <Grain />
      </section>

      <section className="relative overflow-hidden bg-sh-yellow">
        <Shape shape={bracketOpen} className="absolute left-[8%] top-[18%] w-[45%] text-white" />
        <Otter name="stormy" className="absolute bottom-0 left-1/2 h-[85%] -translate-x-1/2" />
        <Shape shape={bracketClose} className="absolute bottom-[8%] right-[4%] w-[45%] text-white" />
        <Grain />
      </section>

      <section className="relative overflow-hidden bg-sh-orange">
        <Shape shape={braceOpen} className="absolute left-[4%] top-[20%] w-[45%] text-sh-white" />
        <Otter name="sparky" className="absolute bottom-[2%] left-1/2 h-[80%] -translate-x-1/2" />
        <Shape shape={braceClose} className="absolute bottom-[6%] right-[4%] w-[45%] text-sh-white" />
        <Grain />
      </section>

      <section className="relative overflow-hidden bg-sh-black p-[1rem] text-sh-white">
        <p className="type-display text-[1.6rem] leading-[1.04]">
          StormHacks 26’ is western canada’s biggest hackathon
        </p>
        <CodeMatrix dotColor="#0278FF" labelColor="#FF5D0B" className="absolute -bottom-[1rem] right-[1rem] h-[60%]" />
        <Grain />
      </section>

      <section className="relative flex flex-col items-start gap-[0.75rem] overflow-hidden bg-sh-white p-[1rem]">
        <Logo className="h-[1.6rem] text-sh-blue" />
        <div className="flex gap-[0.5rem]">
          <BracketButton>Print</BracketButton>
          <BracketButton variant="secondary">Retake All</BracketButton>
        </div>
        <BracketButton size="lg">Start</BracketButton>
        <div className="flex gap-[0.4rem]">
          {["bg-sh-blue", "bg-sh-orange", "bg-sh-yellow", "bg-sh-white ring-1 ring-sh-grey", "bg-sh-black"].map((c) => (
            <span key={c} className={`h-[2.5rem] w-[2.5rem] rounded-[0.6rem] ${c}`} />
          ))}
        </div>
        <p className="text-[0.9rem] font-medium">Small paragraph in Inter Medium.</p>
      </section>

      <section className="relative overflow-hidden bg-sh-blue">
        <Otter name="pink" className="absolute bottom-0 left-1/2 h-[80%] -translate-x-1/2" />
        <CodeMatrix matrix={MATRIX_SPRAY} dotColor="#F9B200" labelColor="#ECECEF" className="absolute left-[0.5rem] top-[0.5rem] h-[45%]" />
        <Grain />
      </section>
    </main>
  );
}

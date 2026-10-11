"use client";

import { useState, type ReactNode } from "react";

/** The longest WPA passphrase. The keyboard stops here so nothing longer reaches print-server. */
export const KEYBOARD_MAX = 63;

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];
const LETTER_ROWS = [
  ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
  ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
  ["z", "x", "c", "v", "b", "n", "m"],
];
const SYMBOL_ROWS = [
  ["!", "@", "#", "$", "%", "^", "&", "*", "(", ")"],
  ["-", "_", "=", "+", "{", "}", "[", "]", "\\"],
  [";", ":", "'", '"', "~", "/", "?"],
];

type Layer = "letters" | "symbols";

/**
 * Plain touch keyboard for the Wi-Fi password. The field it fills is read-only,
 * so the browser never opens its own keyboard over the panel. Keys are 52 px
 * tall, above the 48 px touch floor; the layout fits the right-hand column at 1024x600.
 * Set disabled to lock every key, such as while a join is using the password.
 */
export default function OnScreenKeyboard({
  value,
  onChange,
  maxLength = KEYBOARD_MAX,
  disabled = false,
}: {
  value: string;
  onChange: (next: string) => void;
  maxLength?: number;
  disabled?: boolean;
}) {
  const [layer, setLayer] = useState<Layer>("letters");
  // One-shot shift: the next letter is capitalised, then shift clears.
  const [shift, setShift] = useState(false);

  const letters = layer === "letters";
  const rows = letters ? LETTER_ROWS : SYMBOL_ROWS;
  const full = value.length >= maxLength;
  const typingOff = disabled || full;

  const shown = (ch: string) => (letters && shift ? ch.toUpperCase() : ch);

  function type(ch: string) {
    if (disabled || value.length >= maxLength) return;
    onChange(value + shown(ch));
    setShift(false);
  }

  const chars = (list: string[]) =>
    list.map((ch) => (
      <Key key={ch} label={ch} disabled={typingOff} onPress={() => type(ch)}>
        {shown(ch)}
      </Key>
    ));

  return (
    <div role="group" aria-label="On-screen keyboard" className="flex flex-col gap-[0.3rem]">
      <div className="grid grid-cols-10 gap-[0.3rem]">{chars(DIGITS)}</div>
      <div className="grid grid-cols-10 gap-[0.3rem]">{chars(rows[0])}</div>
      <div className="mx-auto grid w-[90%] grid-cols-9 gap-[0.3rem]">{chars(rows[1])}</div>
      <div className="grid grid-cols-[1.5fr_repeat(7,minmax(0,1fr))_1.5fr] gap-[0.3rem]">
        {letters ? (
          <Key tone="fn" label="Shift" pressed={shift} disabled={disabled} onPress={() => setShift((s) => !s)}>
            Shift
          </Key>
        ) : (
          <span aria-hidden />
        )}
        {chars(rows[2])}
        <Key tone="fn" label="Backspace" disabled={disabled} onPress={() => onChange(value.slice(0, -1))}>
          ⌫
        </Key>
      </div>
      <div className="grid grid-cols-[1.6fr_1fr_4fr_1fr] gap-[0.3rem]">
        <Key
          tone="fn"
          label={letters ? "Switch to symbols" : "Switch to letters"}
          disabled={disabled}
          onPress={() => setLayer(letters ? "symbols" : "letters")}
        >
          {letters ? "?123" : "ABC"}
        </Key>
        <Key label="," disabled={typingOff} onPress={() => type(",")}>
          ,
        </Key>
        <Key label="Space" disabled={typingOff} onPress={() => type(" ")}>
          Space
        </Key>
        <Key label="." disabled={typingOff} onPress={() => type(".")}>
          .
        </Key>
      </div>
    </div>
  );
}

function Key({
  children,
  label,
  onPress,
  tone = "char",
  pressed,
  disabled = false,
}: {
  children: ReactNode;
  label?: string;
  onPress: () => void;
  tone?: "char" | "fn";
  /** Set for toggle keys such as shift. */
  pressed?: boolean;
  disabled?: boolean;
}) {
  const look =
    pressed === true
      ? "bg-sh-black text-sh-white"
      : tone === "fn"
        ? "bg-sh-black/[0.12] text-[1.1rem] active:bg-sh-black/25"
        : "bg-sh-black/[0.06] text-[1.4rem] active:bg-sh-black/15";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onPress}
      className={`flex h-[3.25rem] min-w-0 items-center justify-center rounded-[0.7rem] font-semibold transition-colors disabled:opacity-40 ${look}`}
    >
      {children}
    </button>
  );
}

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // StormHacks 2026 primary palette (design/design.md §1)
        sh: {
          blue: "#0278FF", // Stormy Blue
          orange: "#FF5D0B", // Orange Orange
          yellow: "#F9B200", // Sparky Yellow
          white: "#ECECEF", // Hurricane White
          black: "#101A21", // Shady Black
          muted: "#DBDBE2",
          grey: "#6F7E98",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "1rem",
      },
      animation: {
        flash: "flash 0.35s ease-out forwards",
        countdown: "countdown 0.9s ease-out",
        pop: "pop 0.35s ease-out",
        rise: "rise 0.5s ease-out both",
        boing: "boing 0.55s cubic-bezier(0.3, 1.5, 0.5, 1)",
        burst: "burst 0.7s ease-out forwards",
      },
      keyframes: {
        pop: {
          "0%": { transform: "scale(0.94)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        slide: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(300%)" },
        },
        rise: {
          "0%": { transform: "translateY(8%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        // Squash on the tap, then spring up taller and settle.
        boing: {
          "0%": { transform: "scale(1.12, 0.82)" },
          "35%": { transform: "scale(0.92, 1.1)" },
          "65%": { transform: "scale(1.04, 0.97)" },
          "100%": { transform: "scale(1, 1)" },
        },
        burst: {
          "0%": { transform: "translate(-50%, -50%) scale(0.2) rotate(0deg)", opacity: "1" },
          "70%": { opacity: "1" },
          "100%": {
            transform: "translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(1) rotate(120deg)",
            opacity: "0",
          },
        },
        flash: {
          "0%": { opacity: "0.95" },
          "100%": { opacity: "0" },
        },
        countdown: {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "30%": { transform: "scale(1.08)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
export default config;

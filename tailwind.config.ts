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

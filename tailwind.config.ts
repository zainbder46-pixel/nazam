import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: { sans: ["'IBM Plex Sans Arabic'", "system-ui", "sans-serif"] },
      colors: {
        bg: "rgb(var(--bg) / <alpha-value>)",
        surface: "rgb(var(--surface) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        ink: "rgb(var(--ink) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        brand: "rgb(var(--brand) / <alpha-value>)",
        gold: "rgb(var(--gold) / <alpha-value>)",
      },
      boxShadow: { soft: "0 1px 2px rgb(0 0 0 / .04), 0 4px 16px rgb(0 0 0 / .04)" },
    },
  },
  plugins: [],
} satisfies Config;

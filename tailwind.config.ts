import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg)",
        surface: "var(--color-surface)",
        "surface-2": "var(--color-surface-2)",
        border: "var(--color-border)",
        fg: "var(--color-fg)",
        "fg-muted": "var(--color-fg-muted)",
        "fg-faint": "var(--color-fg-faint)",
        accent: "var(--color-accent)",
        "accent-fg": "var(--color-accent-fg)",
        "accent-hover": "var(--color-accent-hover)",
        success: "var(--color-success)",
        danger: "var(--color-danger)",
        "series-1": "var(--color-series-1)",
        "series-2": "var(--color-series-2)",
        grid: "var(--color-grid)",
        axis: "var(--color-axis)",
        "axis-ink": "var(--color-axis-ink)",
      },
      borderRadius: {
        sm: "6px",
        md: "10px",
        lg: "14px",
      },
      boxShadow: {
        md: "0 6px 16px rgba(0, 0, 0, 0.10)",
      },
      fontFamily: {
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};

export default config;

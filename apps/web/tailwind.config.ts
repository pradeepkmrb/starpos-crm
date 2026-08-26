import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef1ff",
          100: "#dde4ff",
          200: "#b8c5ff",
          300: "#8ea0ff",
          400: "#6478ff",
          500: "#4256f0", // primary — cobalt blue
          600: "#3140d1",
          700: "#2731a8",
          800: "#1f2680", // deep indigo — buttons, active nav
          900: "#171c5e",
          950: "#0d1038",
        },
        ink: {
          // Dark neutral scale for the nav shell — deliberately near-black
          // rather than white, so the app's structure reads differently
          // from a typical light-sidebar SaaS dashboard.
          50: "#f5f6f8",
          200: "#c9cdd6",
          300: "#9aa1b0",
          400: "#6b7280",
          700: "#232838",
          800: "#181c28",
          900: "#0f121a",
          950: "#0a0c12",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 12px -2px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;

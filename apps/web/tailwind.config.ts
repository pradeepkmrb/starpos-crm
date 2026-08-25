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
          50: "#eafaf3",
          100: "#cdf2df",
          200: "#9de5c1",
          300: "#65d09e",
          400: "#37b981",
          500: "#25d366", // WhatsApp green
          600: "#1da851",
          700: "#158a5f", // deep teal-green
          800: "#128c7e", // WhatsApp teal
          900: "#0c5c52",
          950: "#073b35",
        },
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

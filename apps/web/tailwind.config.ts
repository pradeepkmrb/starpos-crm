import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // "Emerald fresh": the brand green used for primary actions, active
        // navigation and hero cards. Shared with the mobile app's theme.
        brand: {
          50: "#ecfdf5",
          100: "#d1fae5",
          200: "#a7f3d0",
          300: "#6ee7b7",
          400: "#34d399",
          500: "#10b981",
          600: "#059669", // primary
          700: "#047857",
          800: "#065f46", // links, text on brand-50
          900: "#064e3b",
          950: "#022c22",
        },
        // Deep navy for the sidebar shell, so structure reads apart from content.
        ink: {
          50: "#f8fafc",
          200: "#cbd5e1",
          300: "#94a3b8",
          400: "#64748b",
          700: "#1e293b",
          800: "#152036",
          900: "#0f172a",
          950: "#0a1020",
        },
        // The soft mint page background behind white cards.
        canvas: "#f4f7f6",
        // WhatsApp Web's palette, used only by the Inbox so chats feel familiar.
        wa: {
          panel: "#f0f2f5",
          active: "#e9edef",
          line: "#e9edef",
          chat: "#efeae2",
          out: "#d9fdd3",
          ink: "#111b21",
          muted: "#667781",
          green: "#00a884",
          "green-dark": "#008069",
          read: "#53bdeb",
        },
      },
      fontFamily: {
        sans: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-body)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "2.5xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 2px 8px -2px rgb(15 23 42 / 0.06)",
        "card-hover": "0 10px 24px -8px rgb(15 23 42 / 0.14), 0 2px 6px -2px rgb(15 23 42 / 0.06)",
        brand: "0 10px 24px -10px rgb(5 150 105 / 0.55)",
        pop: "0 16px 40px -12px rgb(15 23 42 / 0.25)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "slide-in": {
          from: { transform: "translateX(100%)" },
          to: { transform: "translateX(0)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "toast-in": "toast-in 180ms ease-out",
        shimmer: "shimmer 1.4s infinite",
        "slide-in": "slide-in 220ms cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;

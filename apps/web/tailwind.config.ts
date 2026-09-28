import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // StarPOS blue, taken from the logo's star: primary actions, headers and
        // hero cards. Shared with the mobile app's theme.
        brand: {
          50: "#eef5fc",
          100: "#d8e7f7",
          200: "#b3cfee",
          300: "#7fade0",
          400: "#4a86cf",
          500: "#1a63b5",
          600: "#034694", // primary — the logo blue
          700: "#033a7a",
          800: "#042f63", // links, text on brand-50
          900: "#06284f",
          950: "#041a35",
        },
        // StarPOS green, taken from the logo's wordmark: active navigation,
        // success states and highlights.
        leaf: {
          50: "#ebf9f0",
          100: "#cff1dc",
          200: "#a1e3ba",
          300: "#64cf8c",
          400: "#2bb962",
          500: "#00a03a", // the logo green
          600: "#008a32",
          700: "#006e29",
          800: "#055724",
          900: "#064820",
        },
        // Deep StarPOS navy for the sidebar shell, so structure reads apart from content.
        ink: {
          50: "#f6f9fd",
          200: "#c6d4e8",
          300: "#93a9c9",
          400: "#6581a8",
          700: "#123565",
          800: "#0a2a55",
          900: "#062147",
          950: "#031531",
        },
        // The soft blue-grey page background behind white cards.
        canvas: "#f3f6fb",
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
        brand: "0 10px 24px -10px rgb(3 70 148 / 0.5)",
        leaf: "0 10px 24px -10px rgb(0 160 58 / 0.55)",
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

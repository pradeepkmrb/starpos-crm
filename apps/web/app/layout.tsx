import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digitel — WhatsApp Marketing Platform",
  description: "Bring your own WhatsApp API and scale your business.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}

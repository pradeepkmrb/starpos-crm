import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const body = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "Digitell — WhatsApp Marketing and Sales CRM",
  description: "Bring your own WhatsApp API, run broadcasts, and manage your field sales team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={body.variable}>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Caveat, Inter, Poppins } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-poppins",
});
const caveat = Caveat({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-caveat" });

export const metadata: Metadata = {
  title: "RideX — Your Journey. Your Way.",
  description: "Book a reliable ride in seconds, choose the perfect car for your journey, and track your driver live from pickup to drop-off.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable} ${caveat.variable}`}>
      <body className="bg-cream text-ink antialiased">{children}</body>
    </html>
  );
}

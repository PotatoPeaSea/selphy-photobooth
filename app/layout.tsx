import type { Metadata, Viewport } from "next";
import { fraunces, inter } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "StormHacks 26’ Photobooth",
  description: "Snap with StormHacks — 4×6 prints at StormHacks 26’, SFU Burnaby",
};

export const viewport: Viewport = {
  themeColor: "#0278FF",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}

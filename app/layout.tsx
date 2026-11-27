import type { Metadata } from "next";
import "@fontsource/fraunces/600.css";
import "@fontsource/outfit/400.css";
import "@fontsource/outfit/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShodhSabha",
  description: "A research council. Six agents argue in the open, then a scribe writes a cited brief.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

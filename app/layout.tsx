import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Asirt Pickleball Open",
  description: "Live scoring, leaderboard, and knockout management for the Asirt Pickleball tournament."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

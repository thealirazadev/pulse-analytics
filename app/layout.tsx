import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "pulse-analytics",
  description: "Self-hosted, privacy-first web analytics.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        {children}
      </body>
    </html>
  );
}

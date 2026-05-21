import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FB-Akademie Teilnahmemanagement",
  description: "Verwaltung von Schulungs-Anmeldungen",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}

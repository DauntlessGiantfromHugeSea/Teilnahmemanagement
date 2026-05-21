import "./globals.css";
import Script from "next/script";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "FB-Akademie Teilnahmemanagement",
  description: "Verwaltung von Schulungs-Anmeldungen",
  manifest: "/manifest.webmanifest",
  applicationName: "FB-Akademie Teilnahmen",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FB-Akademie Teilnahmen",
  },
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png" },
    ],
    apple: [{ url: "/favicon.png" }],
    shortcut: ["/favicon.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  themeColor: "#007e80",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body className="min-h-screen antialiased">
        {children}
        <Script id="sw-register" strategy="afterInteractive">
          {`if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }`}
        </Script>
      </body>
    </html>
  );
}

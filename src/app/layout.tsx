import "./globals.css";
import Script from "next/script";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "FB-Akademie Teilnahmemanagement",
  description: "Verwaltung von Schulungs-Anmeldungen",
  manifest: "/manifest.webmanifest",
  applicationName: "FBA Teilnahmen",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FBA Teilnahmen",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    shortcut: ["/favicon-32.png"],
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
      <body className="min-h-screen antialiased flex flex-col">
        <div className="flex-1">{children}</div>
        <footer className="border-t border-slate-200 bg-white/60 py-4 px-4 text-xs text-slate-500 text-center">
          <a href="https://fb-akademie.de/impressum" target="_blank" rel="noopener noreferrer" className="hover:text-brand-700 hover:underline">
            Impressum
          </a>
          <span className="mx-2 text-slate-300">·</span>
          <a href="https://fb-akademie.de/datenschutz" target="_blank" rel="noopener noreferrer" className="hover:text-brand-700 hover:underline">
            Datenschutz
          </a>
        </footer>
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

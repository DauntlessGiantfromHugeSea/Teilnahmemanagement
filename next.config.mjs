/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "fb-akademie.de" },
    ],
  },
  async headers() {
    return [
      {
        // Anmeldeseiten sind absichtlich iframe-faehig fuer die WP-Einbettung,
        // alles andere bleibt durch den default-X-Frame-Options-Schutz blockiert
        // (Caddy/nginx davor sollten X-Frame-Options nicht auf DENY zwingen).
        source: "/anmeldung/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://fb-akademie.de https://*.fb-akademie.de;",
          },
          { key: "X-Frame-Options", value: "" },
        ],
      },
    ];
  },
  // pdfkit laedt seine AFM-Fonts ueber __dirname zur Laufzeit. Damit das
  // funktioniert, darf webpack pdfkit nicht buendeln, sondern muss es per
  // require() aus node_modules zur Laufzeit laden. Der Dockerfile-Runner-
  // Stage kopiert pdfkit + transitive Deps explizit mit hinein.
  experimental: {
    serverComponentsExternalPackages: ["pdfkit", "fontkit"],
    outputFileTracingIncludes: {
      "/api/events/*/attendance/pdf/route": [
        "./node_modules/pdfkit/js/data/**",
      ],
    },
  },
};
export default nextConfig;

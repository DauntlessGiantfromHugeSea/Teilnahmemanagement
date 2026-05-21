/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "fb-akademie.de" },
    ],
  },
  // pdfkit laedt seine AFM-Fonts dynamisch zur Laufzeit -
  // diese Dateien muessen ins standalone Output mit hinein.
  outputFileTracingIncludes: {
    "/api/events/*/attendance/pdf/route": [
      "./node_modules/pdfkit/js/data/**",
    ],
  },
};
export default nextConfig;

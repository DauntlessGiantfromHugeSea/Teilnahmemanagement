/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "fb-akademie.de" },
    ],
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

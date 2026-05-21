import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1f3a8a",
          50: "#eef2ff",
          100: "#dde6ff",
          500: "#3b5bdb",
          600: "#2f49b8",
          700: "#243a96",
          800: "#1f3a8a",
          900: "#172554",
        },
      },
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;

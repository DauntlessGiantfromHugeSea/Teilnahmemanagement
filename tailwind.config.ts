import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "rgb(0, 126, 128)",
          50: "#e6f2f2",
          100: "#cce5e6",
          200: "#99cbcd",
          300: "#66b1b3",
          400: "#339798",
          500: "rgb(0, 126, 128)",
          600: "#006566",
          700: "#004c4d",
          800: "#003233",
          900: "#00191a",
        },
        accent: {
          DEFAULT: "#d4ff3d",
          50: "#f6ffe0",
          100: "#edffc2",
          200: "#dcff85",
          300: "#cdff58",
          400: "#c2f53a",
          500: "#a8db1c",
          600: "#82ad14",
          700: "#5d7a0e",
        },
        ink: {
          DEFAULT: "#0a1f2c",
          50: "#eef2f4",
          100: "#dde6ea",
          200: "#b6c5cd",
          300: "#8ea4af",
          400: "#67838f",
          500: "#3f6271",
          600: "#1f3d4b",
          700: "#102733",
          800: "#0a1f2c",
          900: "#06141d",
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

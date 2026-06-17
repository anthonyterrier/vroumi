import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef7f1",
          100: "#d6ecdd",
          200: "#aedabf",
          300: "#7cc198",
          400: "#49a36f",
          500: "#2c8a55",
          600: "#1f6f43",
          700: "#1a5937",
          800: "#17472d",
          900: "#133b26",
        },
      },
    },
  },
  plugins: [],
};

export default config;

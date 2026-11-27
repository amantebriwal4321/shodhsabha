import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14080c",
        plaster: "#2a1218",
        cream: "#f3e6d4",
        gold: "#e6b15a",
        flame: "#ff7a3c",
        lotus: "#e25b86",
        leaf: "#2f9e8f",
        sky: "#9eb7ff",
      },
      fontFamily: {
        display: ["Fraunces", "Palatino", "Georgia", "serif"],
        sans: ["Outfit", "Avenir Next", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

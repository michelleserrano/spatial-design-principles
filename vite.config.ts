import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path notes:
// - dev server always serves at "/"
// - production builds default to "/spatial-principles-site/" for GitHub Pages
//   (override with VITE_BASE_PATH env var if you host elsewhere or use a
//   custom domain — set VITE_BASE_PATH=/ for root deployment)
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base:
    command === "serve"
      ? "/"
      : process.env.VITE_BASE_PATH ?? "/spatial-principles-site/",
}));

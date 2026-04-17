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
      : process.env.VITE_BASE_PATH ?? "/spatial-design-principles/",
  build: {
    // Output into docs/ so we can publish via GitHub Pages using the
    // "master /docs" source — all commits and pushes happen through
    // Cursor's Source Control UI (no terminal auth required for GHE SSO).
    outDir: "docs",
    emptyOutDir: true,
  },
}));

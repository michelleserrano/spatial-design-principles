import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Base path notes:
// - dev server always serves at "/"
// - production uses "./" (relative) so the build works on any host path
//   (GHE Pages serves at /{user}/{repo}/, public GH Pages at /{repo}/,
//   custom domains at /). Relative paths sidestep all of that.
//   Override with VITE_BASE_PATH if you ever need an absolute base.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base:
    command === "serve" ? "/" : process.env.VITE_BASE_PATH ?? "./",
  build: {
    // Output into docs/ so we can publish via GitHub Pages using the
    // "master /docs" source — all commits and pushes happen through
    // Cursor's Source Control UI (no terminal auth required for GHE SSO).
    outDir: "docs",
    emptyOutDir: true,
  },
}));

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // `npm run dev` serves the SPA; API calls go to `wrangler dev` on :8787.
  server: { proxy: { "/api": "http://localhost:8787" } },
  build: { outDir: "dist", sourcemap: false },
});

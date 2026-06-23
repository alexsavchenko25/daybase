import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages liegt unter /<repo>/. base wird im CI aus dem Repo-Namen
// gesetzt (VITE_BASE), lokal = "/".
const base = process.env.VITE_BASE || "/";

// https://vitejs.dev/config/
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // Auto-Registrierung des Service Workers — kein Eingriff in App-Logik.
      injectRegister: "auto",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Daybase",
        short_name: "Daybase",
        description: "Lokales Produktivitäts-Dashboard — Tasks, Habits, Journal, Trades.",
        lang: "de",
        // start_url/scope werden vom Plugin aus `base` abgeleitet.
        display: "standalone",
        orientation: "portrait",
        theme_color: "#0b0d12",
        background_color: "#0b0d12",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // SPA-Offline-Fallback: index.html precached + Navigations-Fallback.
        navigateFallback: `${base}index.html`,
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
});

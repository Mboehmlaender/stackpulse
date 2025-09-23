import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3300", // dein Backend
        changeOrigin: true,
      },
    },
    allowedHosts: [
      "10.10.10.23",    // dein Dev-Rechner
      "stackpulse.d-razz.de",     // der Host, den du brauchst
      "localhost",
    ],
  },
});


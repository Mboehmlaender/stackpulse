import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [{ find: "@", replacement: "/src" }],
  },
  server: {
    host: true, // Hört auf allen Netzwerk-Interfaces, kein localhost notwendig
    port: 5173, // optional, Standardport für Vite
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4001', // Backend lokal auf Port 4001
        changeOrigin: true
      },
      '/socket.io': {
        target: 'http://127.0.0.1:4001', // WebSocket-Verbindungen über Proxy weiterleiten
        ws: true,
        changeOrigin: true
      }
    }
  }
});

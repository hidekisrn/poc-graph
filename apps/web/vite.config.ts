import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = process.env.WEB_API_PORT ?? "8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // 127.0.0.1 (não "localhost") p/ evitar resolução IPv6 (::1) — a API
      // escuta em IPv4, então "localhost" pode dar ECONNREFUSED ::1.
      "/api": `http://127.0.0.1:${apiPort}`,
    },
  },
});

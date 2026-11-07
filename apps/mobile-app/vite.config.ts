import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: "localhost",
  },
  preview: {
    port: 3001,
    host: "localhost",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});

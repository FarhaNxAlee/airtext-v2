import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  root: "client",
  build: {
    outDir: "../dist",
    assetsDir: "assets",
    emptyOutDir: true,
    manifest: true,
    rollupOptions: {
      input: {
        main: "client/main.ts",
      },
    },
  },
});

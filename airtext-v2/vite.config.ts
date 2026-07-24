import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  root: "client",
  publicDir: "public",
  build: {
    outDir: "../dist",
    assetsDir: "assets",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: "client/main.js",
      },
      output: {
        // Fixed (unhashed) filenames -- src/html.ts hardcodes /assets/main.js
        // and /assets/main.css rather than reading a Vite manifest at
        // runtime, since this is a single-entry app with no need for
        // multiple cache-busted bundles.
        entryFileNames: "assets/main.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/main.[ext]",
      },
    },
  },
});

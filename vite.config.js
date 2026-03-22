import { defineConfig } from "vite-plus";
import { resolve } from "path";

const __dirname = import.meta.dirname;

export default defineConfig({
  root: "public",
  publicDir: false,

  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, "public/index.html"),
        program: resolve(__dirname, "public/program.html"),
        about: resolve(__dirname, "public/about.html"),
      },
    },
  },

  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3456",
      "/images": "http://localhost:3456",
      "/thumbnails": "http://localhost:3456",
    },
  },
});

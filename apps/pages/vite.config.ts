import { defineConfig } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "ノート",
        short_name: "ノート",
        description: "グラフで知識を管理するメモ帳",
        lang: "ja",
        theme_color: "#ffffff",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "icon-maskable.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff,woff2}"],
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": "/src/ui",
    },
  },
  fmt: {
    ignorePatterns: ["**/ui/**/*", "worker-configuration.d.ts", "dev-dist/**"],
  },
  lint: {
    plugins: ["react", "promise", "import"],
    options: { typeAware: true, typeCheck: true },
    ignorePatterns: ["worker-configuration.d.ts", "dev-dist/**"],
  },
  run: {
    tasks: {
      check: {
        cache: true,
        command: "vp check --fix",
      },
      build: {
        dependsOn: ["core#pack", "adapter-idb#pack"],
        command: "vp build",
      },
    },
  },
});

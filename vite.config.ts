import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["VITE_", "EXPO_PUBLIC_"],
  esbuild: {
    pure: ["console.log", "console.info", "console.debug"],
  },
  resolve: {
    extensions: [
      ".web.tsx",
      ".web.ts",
      ".web.jsx",
      ".web.js",
      ".tsx",
      ".ts",
      ".jsx",
      ".js",
      ".json",
    ],
    alias: [
      { find: /^react-native$/, replacement: "react-native-web" },
      { find: "@", replacement: path.resolve(__dirname, "src") },
      {
        find: "firebase/app",
        replacement: path.resolve(__dirname, "src/services/appCompat.ts"),
      },
      {
        find: "firebase/functions",
        replacement: path.resolve(__dirname, "src/services/functionsCompat.ts"),
      },
      {
        find: "firebase/firestore",
        replacement: path.resolve(__dirname, "src/services/postgresFirestoreCompat.ts"),
      },
    ],
  },
  server: {
    host: true,
    port: 5173,
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }

          if (id.includes("react-icons")) {
            return "icons";
          }

          if (id.includes("@react-navigation")) {
            return "navigation";
          }
        },
      },
    },
  },
});


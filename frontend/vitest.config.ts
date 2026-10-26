import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    setupFiles: ["./src/test/setup.ts"],
    projects: [
      {
        extends: true,
        test: { name: "node", include: ["src/**/__tests__/**/*.test.ts"], environment: "node" },
      },
      {
        extends: true,
        test: { name: "dom", include: ["src/**/__tests__/**/*.test.tsx"], environment: "jsdom" },
      },
    ],
  },
});

import { defineConfig } from "vitest/config";
import tsConfigPaths from "vite-tsconfig-paths";

// Standalone from vite.config.ts: the app config runs the TanStack Start /
// nitro pipeline, which is not needed (and not usable) for unit tests.
export default defineConfig({
  plugins: [tsConfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
    },
  },
});

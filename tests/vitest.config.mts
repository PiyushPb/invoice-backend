import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 20000,
    hookTimeout: 20000,
    // Run integration test suites serially or per-file to avoid state collisions if needed
    fileParallelism: false,
  },
});

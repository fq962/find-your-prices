import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Recursively ignore nested copies (e.g. agent worktrees under .claude/)
    // so their build artifacts and duplicated source files aren't linted.
    // Mirrors the fix already applied in vitest.config.mts ("**/.claude/**").
    "**/.claude/**",
    "**/.next/**",
  ]),
]);

export default eslintConfig;

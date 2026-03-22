module.exports = {
  root: true,
  ignorePatterns: ["dist", "node_modules", "coverage", ".tsdist", "*.tsbuildinfo"],
  env: {
    es2022: true,
    node: true,
  },
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  overrides: [
    {
      files: ["apps/mobile/**/*.{ts,tsx}", "apps/host/renderer/**/*.{ts,tsx}"],
      env: {
        browser: true,
        es2022: true,
      },
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    {
      files: ["**/*.test.ts", "vitest.config.ts", "vitest.config.mts"],
      globals: {
        describe: "readonly",
        expect: "readonly",
        it: "readonly",
        vi: "readonly",
      },
    },
  ],
  rules: {
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        prefer: "type-imports",
      },
    ],
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
  },
};

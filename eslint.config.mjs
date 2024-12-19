import { fixupConfigRules, fixupPluginRules } from "@eslint/compat";
import _import from "eslint-plugin-import";
import tsParser from "@typescript-eslint/parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      "**/jest.config.js",
      "**/webpack.config.js",
      "packages/*/dist/**/*",
      "**/dist",
    ],
  },
  ...fixupConfigRules(
    compat.extends(
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended",
      "plugin:import/recommended",
      "plugin:import/typescript"
    )
  ),
  {
    settings: {
      "import/parsers": {
        "@typescript-eslint/parser": [".ts", ".tsx"],
      },

      "import/resolver": {
        typescript: true,
        node: true,
      },
    },

    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-explicit-any": "off",
      "import/no-unresolved": "error",

      "import/order": [
        "error",
        {
          groups: ["builtin", "external", "parent", "sibling", "index"],

          alphabetize: {
            order: "asc",
          },
        },
      ],
    },
  },
  {
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest", // Changed from 5 to "latest"
      sourceType: "module", // Changed from "script" to "module"

      parserOptions: {
        project: ["packages/*/tsconfig.json"],
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
];

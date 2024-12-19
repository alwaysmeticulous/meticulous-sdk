import { rule as redactRequiredFields } from "./rules/redact-required-fields.rule.js";

const { name, version } =
  // `import`ing here would bypass the TSConfig's `"rootDir": "src"`
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("../package.json") as typeof import("../package.json");

const plugin = {
  configs: {
    get recommended() {
      return recommended;
    },
  },
  meta: { name, version },
  rules: {
    "redact-required-fields": redactRequiredFields,
  },
};

const recommended = {
  plugins: {
    "redact-required-fields": plugin,
  },
  rules: {
    "redact-required-fields": redactRequiredFields,
  },
};

export = plugin;

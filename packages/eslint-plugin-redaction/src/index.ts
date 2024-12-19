import { rule as redactRequiredFields } from "./rules/redact-required-fields.rule.js";

const plugin = {
  configs: {
    get recommended() {
      return recommended;
    },
  },
  meta: { name: "@alwaysmeticulous/eslint-plugin-redaction", version: "0.0.1" },
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

import { RuleTester } from "@typescript-eslint/utils/dist/ts-eslint";
import { rule } from "./redact-nested-fields.rule";

// RuleTester.setDefaultConfig({
//   parser: "@typescript-eslint/parser",
//   parserOptions: {
//     ecmaVersion: 2018,
//     sourceType: "module",
//     project: "./tsconfig.json",
//   },
// });

const ruleTester = new RuleTester();

ruleTester.run("missingRedactors", rule, {
  valid: [
    // Complete redactors specified
    {
      code: `
        const redactor = NestedFieldsRedactor.builder().createRedactor<"ssn" | "firstName">({
          strings: {
            ssn: doNotRedact,
            firstName: doNotRedact,
          },
        });
      `,
    },
    // Single field, fully specified
    {
      code: `
        const redactor = NestedFieldsRedactor.builder().createRedactor<"ssn">({
          strings: {
            ssn: doNotRedact,
          },
        });
      `,
    },
    // Not a createRedactor call (should be ignored)
    {
      code: `
        const obj = {
          strings: {}
        };
      `,
    },
  ],
  invalid: [
    // Missing one field
    {
      code: `
        const redactor = NestedFieldsRedactor.builder().createRedactor<"ssn" | "firstName">({
          strings: {
            ssn: doNotRedact,
          },
        });
      `,
      errors: [
        {
          messageId: "missingRedactors",
          data: {
            fields: "firstName",
          },
        },
      ],
      output: `
        const redactor = NestedFieldsRedactor.builder().createRedactor<"ssn" | "firstName">({
          strings: {
            ssn: doNotRedact,
            firstName: doNotRedact,
          },
        });
      `,
    },
    // Empty strings object
    {
      code: `
        const redactor = NestedFieldsRedactor.builder().createRedactor<"ssn" | "firstName">({
          strings: {},
        });
      `,
      errors: [
        {
          messageId: "missingRedactors",
          data: {
            fields: "ssn, firstName",
          },
        },
      ],
      output: `
        const redactor = NestedFieldsRedactor.builder().createRedactor<"ssn" | "firstName">({
          strings: {
            ssn: doNotRedact,
            firstName: doNotRedact
          },
        });
      `,
    },
    // Multiple missing fields
    {
      code: `
        const redactor = NestedFieldsRedactor.builder().createRedactor<"ssn" | "firstName" | "lastName">({
          strings: {
            ssn: doNotRedact,
          },
        });
      `,
      errors: [
        {
          messageId: "missingRedactors",
          data: {
            fields: "firstName, lastName",
          },
        },
      ],
      output: `
        const redactor = NestedFieldsRedactor.builder().createRedactor<"ssn" | "firstName" | "lastName">({
          strings: {
            ssn: doNotRedact,
            firstName: doNotRedact,
            lastName: doNotRedact,
          },
        });
      `,
    },
  ],
});

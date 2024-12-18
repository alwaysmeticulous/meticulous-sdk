import { RuleTester } from "@typescript-eslint/rule-tester";
import { rule } from "./redact-nested-fields.rule";
import tseslint from "typescript-eslint";
import path from "path";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: {
      projectService: {
        allowDefaultProject: ["*.ts*"],
        defaultProject: "tsconfig.json",
      },
      sourceType: "module",
      module: "NodeNext",
      tsconfigRootDir: path.join(__dirname, "../.."),
    },
  },
});

ruleTester.run("missingRedactors", rule, {
  valid: [
    // Complete redactors specified
    {
      code: `
        type MyObject = {
          ssn: string;
          firstName: string;
        }

        // Some indirection
        type Props = { [K in keyof MyObject]: K }[keyof MyObject];

        class NestedFieldsRedactor {
          static builder() {
            return new NestedFieldsRedactor();
          }

          createRedactor(options: {
            strings: Record<Props, (value: string) => string>;
          }) {
            return options;
          }
        }

        const doNotRedact = (value: string) => value;
        const redactor = NestedFieldsRedactor.builder().createRedactor({
          strings: {
            ssn: doNotRedact,
            firstName: doNotRedact,
          },
        });
      `,
    },
  ],
  invalid: [
    // Missing one field
    {
      code: `
        type MyObject = {
          ssn: string;
          firstName: string;
          lastName: string;
        }

        // Some indirection
        type Props = { [K in keyof MyObject]: K }[keyof MyObject];

        class NestedFieldsRedactor {
          static builder() {
            return new NestedFieldsRedactor();
          }

          createRedactor(options: {
            strings: Record<Props, (value: string) => string>;
          }) {
            return options;
          }
        }

        const doNotRedact = (value: string) => value;
        const redactor = NestedFieldsRedactor.builder().createRedactor({
          strings: {
            ssn: doNotRedact,
            firstName: doNotRedact,
          },
        });
      `,
      errors: [
        {
          messageId: "missingRedactors",
          data: {
            fields: "lastName",
          },
        },
      ],
      output: `
        type MyObject = {
          ssn: string;
          firstName: string;
          lastName: string;
        }

        // Some indirection
        type Props = { [K in keyof MyObject]: K }[keyof MyObject];

        class NestedFieldsRedactor {
          static builder() {
            return new NestedFieldsRedactor();
          }

          createRedactor(options: {
            strings: Record<Props, (value: string) => string>;
          }) {
            return options;
          }
        }

        const doNotRedact = (value: string) => value;
        const redactor = NestedFieldsRedactor.builder().createRedactor({
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

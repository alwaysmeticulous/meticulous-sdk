import { RuleTester } from "@typescript-eslint/rule-tester";
import { rule } from "./redact-required-fields.rule";
import tseslint from "typescript-eslint";
import path from "path";

// This is a copy of the types from redactors-for.ts in the redaction package
const COMMON_TYPES = `
type IsFixedStringUnion<T> = T extends string
  ? string extends T
    ? false
    : true
  : false;

type WithoutNullOrUndefined<T> = T extends null | undefined ? never : T;

type AllValues<T> = UnionToIntersection<T>[keyof UnionToIntersection<T>];

type RelevantPrimitiveFieldNames<
  T,
  PRIMATIVES_TO_REDACT = string | Date
> = AllValues<{
  [K in keyof T]: PrimitiveFieldNamesHelper<
    K,
    WithoutNullOrUndefined<T[K]>,
    PRIMATIVES_TO_REDACT
  >;
}>;

type PrimitiveFieldNamesHelper<K, V, PRIMATIVES_TO_REDACT> =
  IsFixedStringUnion<V> extends true
    ? never
    : V extends PRIMATIVES_TO_REDACT
    ? [K, V]
    : V extends Array<infer U>
    ? U extends PRIMATIVES_TO_REDACT
      ? [K, U]
      : RelevantPrimitiveFieldNames<U>
    : V extends object
    ? RelevantPrimitiveFieldNames<V>
    : never;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I
) => void
  ? I
  : never;

export type Redactor<T> = (value: T) => T;

// Convert a single tuple to a key-value pair in an redactor object
type ToRedactorObject<T> = T extends [infer K, infer V]
  ? K extends string
    ? { [P in K]: Redactor<V> }
    : never
  : never;

type TuplePairsToRedactorObject<T> = UnionToIntersection<ToRedactorObject<T>>;

export type RedactorsFor<
  T
> = TuplePairsToRedactorObject<
  RelevantPrimitiveFieldNames<T, string>
>;

class NestedFieldsRedactor {
  static builder() {
    return new NestedFieldsRedactor();
  }

  createRedactor<T>(options: {
    strings: RedactorsFor<T>
  }) {
    return options;
  }
}

const doNotRedact = (value: string) => value;
`;

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

ruleTester.run("redactRequiredFields", rule, {
  valid: [
    // Complete redactors specified
    {
      code: `
        ${COMMON_TYPES}

        interface MyObject {
          ssn: string;
          name: {
            firstName: string;
          }
        }

        const redactor = NestedFieldsRedactor.builder().createRedactor<MyObject>({
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
        ${COMMON_TYPES}

        interface MyObject {
          ssn: string;
          address: {
            street: string;
            city: string;
            state: string;
            zip: string;
          }
          name: {
            firstName: string;
            lastName: string;
          }
          contact: {
            email: string;
            homePhone: string;
            workPhone: string;
            mobilePhone: string;
          }
        }

        const redactor = NestedFieldsRedactor.builder().createRedactor<MyObject>({
          strings: {
            ssn: doNotRedact,
            firstName: doNotRedact,
            street: doNotRedact,
            city: doNotRedact,
            state: doNotRedact,
            zip: doNotRedact,
            email: doNotRedact,
            homePhone: doNotRedact,
            workPhone: doNotRedact,
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
      output: [
        `
        ${COMMON_TYPES}

        interface MyObject {
          ssn: string;
          address: {
            street: string;
            city: string;
            state: string;
            zip: string;
          }
          name: {
            firstName: string;
            lastName: string;
          }
          contact: {
            email: string;
            homePhone: string;
            workPhone: string;
            mobilePhone: string;
          }
        }

        const redactor = NestedFieldsRedactor.builder().createRedactor<MyObject>({
          strings: {
            ssn: doNotRedact,
            firstName: doNotRedact,
            street: doNotRedact,
            city: doNotRedact,
            state: doNotRedact,
            zip: doNotRedact,
            email: doNotRedact,
            homePhone: doNotRedact,
            workPhone: doNotRedact,
    lastName: doNotRedact,
          },
        });
      `,
        `
        ${COMMON_TYPES}

        interface MyObject {
          ssn: string;
          address: {
            street: string;
            city: string;
            state: string;
            zip: string;
          }
          name: {
            firstName: string;
            lastName: string;
          }
          contact: {
            email: string;
            homePhone: string;
            workPhone: string;
            mobilePhone: string;
          }
        }

        const redactor = NestedFieldsRedactor.builder().createRedactor<MyObject>({
          strings: {
            ssn: doNotRedact,
            firstName: doNotRedact,
            street: doNotRedact,
            city: doNotRedact,
            state: doNotRedact,
            zip: doNotRedact,
            email: doNotRedact,
            homePhone: doNotRedact,
            workPhone: doNotRedact,
    lastName: doNotRedact,
    mobilePhone: doNotRedact,
          },
        });
      `,
      ],
    },
  ],
});

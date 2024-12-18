// These tests run at compile time, and will produce compile errors if they fail
// They test the typing functions

import {
  Redactor,
  RedactorsFor,
} from "../redact-nested-fields/utils/redactors-for";

type Assert<T extends true> = T;
type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y
  ? 1
  : 2
  ? true
  : false;

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace RedactorsForTests {
  export type TestBasicCase = Assert<
    Equal<RedactorsFor<{ a: string }>, { a: Redactor<string> }>
  >;

  export type TestNestedInsideObject = Assert<
    Equal<
      RedactorsFor<{ a: string; nested: { b: string } }>,
      { a: Redactor<string> } & { b: Redactor<string> }
    >
  >;

  export type TestNestedInsideOptionalObject = Assert<
    Equal<
      RedactorsFor<{ a: string; nested?: { b: string } }>,
      { a: Redactor<string> } & { b: Redactor<string> }
    >
  >;

  export type TestNestedInsideNullableObject = Assert<
    Equal<
      RedactorsFor<{ a: string; nested?: { b: string } | null }>,
      { a: Redactor<string> } & { b: Redactor<string> }
    >
  >;

  export type TestNestedInsideUndefinableObject = Assert<
    Equal<
      RedactorsFor<{ a: string; nested?: { b: string } | undefined }>,
      { a: Redactor<string> } & { b: Redactor<string> }
    >
  >;

  export type TestOptionalProperties = Assert<
    Equal<
      RedactorsFor<{ a: string; b?: string; c: string | null | undefined }>,
      { a: Redactor<string> } & { b: Redactor<string> } & {
        c: Redactor<string>;
      }
    >
  >;

  export type TestIgnoresBooleans = Assert<
    Equal<RedactorsFor<{ a: string; b: boolean }>, { a: Redactor<string> }>
  >;

  export type TestNestedInsideObjectArray = Assert<
    Equal<
      RedactorsFor<{ a: string; nested: { b: string }[] }>,
      { a: Redactor<string> } & { b: Redactor<string> }
    >
  >;

  export type TestNestedInsideArray = Assert<
    Equal<
      RedactorsFor<{ a: string; bs: string[] }>,
      { a: Redactor<string> } & { bs: Redactor<string> }
    >
  >;

  export type TestDeepNesting = Assert<
    Equal<
      RedactorsFor<{
        a: string;
        x: { nested: { b: string; nested: { c: string }[] } }[];
      }>,
      { a: Redactor<string> } & { b: Redactor<string> } & {
        c: Redactor<string>;
      }
    >
  >;

  export type TestDuplicatePropertyNames = Assert<
    Equal<
      RedactorsFor<{ a: string; nested: { a: string } }>,
      { a: Redactor<string> }
    >
  >;
}

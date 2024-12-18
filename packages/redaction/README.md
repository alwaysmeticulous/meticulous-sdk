# Redaction

Utilities for implementing common redaction logic for the [Meticulous Recorder Middleware API](https://github.com/alwaysmeticulous/meticulous-sdk/blob/main/packages/sdk-bundles-api/src/record/middleware.ts).

## Utilities for implementing redaction middleware

### Example Usage

```ts
import { dropRequestHeader, transformJsonResponse, redactRecursively, asterixOut } from "@alwaysmeticulous/redaction";

const middleware = [
  dropRequestHeader("Authorization"),
  transformJsonResponse({
    urlRegExp: /https:\/\/api\.example\.com\/.*/,
    transform: (data) => {
      return { ...data, ...(data.sensitive ? { sensitive: asterixOut(data.sensitive) } : {}) };
    },
  }),
  transformJsonResponse({
    urlRegExp: /https:\/\/api\.example\.com\/sensitive.*/,
    transform: (data) => redactRecursively(data, {
      redactString: (str, path) => path[path.length - 1] === "uuid" ? str : asterixOut(str),
    }),
  }),
];
```

## Utilties for redacting javascript objects

To make it easier to redact large complex javascript types we provide a number of helpers.

### asterixOut

This ensures the redacted text is the same length and has the same line breaks as the original text,
thereby allowing you to test the same layout cases.

```ts
import { asterixOut } from "@alwaysmeticulous/redaction";

const redacted = asterixOut("some sensitive text"); // returns "**** ********* ****"
```

### redactString

Redact string intelligently redacts the string by checking for common data formats. This reduces the
risk of your app error'ing during the replay of Meticulous tests due to it failing to operate on the
redacted data (e.g. "*******" is not a valid URL):

```ts
import { redactString } from "@alwaysmeticulous/redaction";

const redacted = redactString("some sensitive text"); // returns "**** ********* ****"
const redacted2 = redactString("test@example.com"); // returns "____@_______.com"
// etc.
```

See [redactString.spec.ts](packages/redaction/src/generic/__tests__/redact-string.spec.ts) for more examples.

### NestedFieldsRedactor

NestedFieldsRedactor allows you to specify a redaction policy for each distinct field name (for example 'ssn' or 'email'). It'll then recursively apply this redaction policy across all nested fields inside an object. Type safety
ensures that compile time errors will be produced if you provide an object that has a field name (nested at any level
inside the object) that you have not specified a redaction policy for.

#### Basic Usage

```ts
import { transformJsonResponse, NestedFieldsRedactor, redactString } from "@alwaysmeticulous/redaction";

interface MyComplexApiType {
  details: {
    ssn: string;
    phoneNumbers: Array<{ mobile?: string; home?: string }>;
  };

  // By default we do not require redacting boolean fields.
  isUSBased: boolean;
}

// Important: include your API type explictly in the call to createRedactor (`createRedactor<MyComplexApiType>`)
const complexApiTypeRedactor = NestedFieldsRedactor.builder().createRedactor<MyComplexApiType>({
  strings: {
    ssn: redactString,
    mobile: redactString,
    home: redactString,
  },
});

const middleware = [
  transformJsonResponse({
    urlRegExp: /https:\/\/api\.example\.com\/.*/,
    transform: (data: MyComplexApiType) => {
      return complexApiTypeRedactor(data);
    },
  }),
];
```

If you update MyComplexApiType to add a new string field:

```ts
interface MyComplexApiType {
  name: string;
  details: {
    ssn: string;
    phoneNumbers: Array<{ mobile?: string; home?: string }>;
  };

  isUSBased: boolean;
}
```

But don't add a corresponding redaction policy for the new `name` field to the 'createRedactor' call, then your
code will fail to compile. This ensures that the redaction is exhaustive.

`createRedactor` will force you to redact all non-enum string fields, but it won't force exhaustive redaction of
other types of fields (dates, booleans, numbers, etc.). See `createRedactorStrict` if you need to enforce exhaustive
redaction at compile time of additional data types.

#### With Defaults

We recommend however using `NestedFieldsRedactor.builderWithDefaults()`, which will provide default redactors
for most common field names. If there are any string fields not covered by those defaults then the compiler will
force you to specify a redaction policy for them:

```ts
const complexApiTypeRedactor = NestedFieldsRedactor.builderWithDefaults().createRedactor<MyComplexApiType>({
  strings: {
    // Don't need to specify a redaction policy for `ssn` as it's covered by the defaults,
    // but we do need to specify a redaction policy for `mobile` and `home` as they're not covered by the defaults.
    mobile: redactString,
    home: redactString,
  },
});
```

#### Pattern Based Redactors

You can also specify redactors that match field names that end with a given postfix, while preserving
compile-time type safety. See [common-redactors.ts](packages/redaction/src/generic/common-redactors.ts)
and [redact-nested-fields.ts](packages/redaction/src/generic/redact-nested-fields.ts) for some examples.

### redactRecursively

Recursively iterates through a JSON object applying the provided redaction function. See [redact-recursively.spec.ts](packages/redaction/src/generic/__tests__/redact-recursively.spec.ts) for more details.

This can be combined with `NestedFieldsRedactor` to provide extra safety. For example:

```
const complexApiTypeRedactor = NestedFieldsRedactor.builder().createRedactor<MyComplexApiType>({
  strings: {
    ssn: redactString,
    mobile: redactString,
    home: redactString,
  },
});

const redactAnythingThatLooksLikeAnSSN = <T>(data: T) => redactRecursively(
    data,
    {
      redactString: (str) => looksLikeAnSSN(str) ? asterixOut(str) : str,
    }
  );

const middleware = [
  transformJsonResponse({
    urlRegExp: /https:\/\/api\.example\.com\/.*/,
    transform: (data: MyComplexApiType) => {
      return redactAnythingThatLooksLikeAnSSN(complexApiTypeRedactor(data));
    },
  }),
];
```

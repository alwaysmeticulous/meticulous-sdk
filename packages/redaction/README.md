# Redaction

Utilities for implementing common redaction logic for the [Meticulous Recorder Middleware API](https://github.com/alwaysmeticulous/meticulous-sdk/blob/main/packages/sdk-bundles-api/src/record/middleware.ts).

## Example Usage

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

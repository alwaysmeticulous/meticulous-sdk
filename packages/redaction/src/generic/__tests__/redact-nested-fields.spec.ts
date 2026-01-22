import { describe, expect, it } from "vitest";
import { asterixOut } from "../asterix-out";
import { doNotRedact } from "../redact-nested-fields/common-redactors";
import { redactKey } from "../redact-nested-fields/pattern-based-redactors";
import { NestedFieldsRedactor } from "../redact-nested-fields/redact-nested-fields";
import { Tweet } from "./typings/twitter-example";

describe("redactNestedFields", () => {
  it("can use a completely custom redactor", () => {
    const doNotRedact = <T>(value: T): T => value;

    // Idea is we have a large set of default redactors that are shared across most endpoints,
    // and we only need to specify redactors on a per-endpoint basis if they have fields with
    // names that are not in the default set.
    const DEFAULT_STRING_REDACTORS = {
      id: asterixOut,
    };

    // The below code will give a compile time error if you miss a field, even if that field is deeply nested
    // inside the object. But it'll only force you to redact string and Date fields
    // (and won't force for type union string fields like `"tweet" | "retweet"`).
    //
    // If you use redactNestedFieldsIncludingNumbers it'll force you to redact number too.
    const redactor = NestedFieldsRedactor.builder().createRedactor<Tweet>({
      strings: {
        ...DEFAULT_STRING_REDACTORS,
        text: asterixOut,
        author_id: doNotRedact,
        conversation_id: doNotRedact,
        created_at: doNotRedact,
        in_reply_to_user_id: doNotRedact,
        username: asterixOut,
        tag: doNotRedact,
        url: () => "https://redacted.com",
        expanded_url: () => "https://redacted.com",
        display_url: () => "https://redacted.com",
        unwound_url: () => "https://redacted.com",
        title: asterixOut,
        description: asterixOut,
        media_key: doNotRedact,
        preview_image_url: () => "https://redacted.com",
        alt_text: asterixOut,
        quote_text: asterixOut,
      },
    });

    const redactedTweet = redactor({
      id: "123",
      text: "Hello, world!",
      type: "tweet",
      details: {
        author_id: "456",
        conversation_id: "789",
        created_at: new Date(Date.parse("2024-01-01T00:00:00Z")),
      },
      entities: {
        mentions: [
          {
            start: 0,
            end: 0,
            username: "a-secret-username",
            id: "123",
          },
        ],
        hashtags: [],
        urls: [],
        media: [],
      },
      metrics: {},
    });

    expect(redactedTweet).toMatchInlineSnapshot(`
      {
        "details": {
          "author_id": "456",
          "conversation_id": "789",
          "created_at": 2024-01-01T00:00:00.000Z,
        },
        "entities": {
          "hashtags": [],
          "media": [],
          "mentions": [
            {
              "end": 0,
              "id": "***",
              "start": 0,
              "username": "*****************",
            },
          ],
          "urls": [],
        },
        "id": "***",
        "metrics": {},
        "text": "****** ******",
        "type": "tweet",
      }
    `);
  });

  it("can build upon the default redactors", () => {
    const doNotRedact = <T>(value: T): T => value;

    const redactor =
      NestedFieldsRedactor.builderWithDefaults().createRedactor<Tweet>({
        strings: {
          tag: doNotRedact,
          media_key: doNotRedact,
          expanded_url: doNotRedact,
        },
      });

    const redactedTweet = redactor({
      id: "123",
      text: "Hello, world!",
      type: "tweet",
      details: {
        author_id: "456",
        conversation_id: "789",
        created_at: new Date(Date.parse("2024-01-01T00:00:00Z")),
      },
      entities: {
        mentions: [
          {
            start: 0,
            end: 0,
            username: "a-secret-username",
            id: "123",
          },
        ],
        hashtags: [],
        urls: [
          {
            url: "https://example.com",
            expanded_url: "https://example.com",
            display_url: "https://example.com",
          },
        ],
        media: [],
      },
      metrics: {},
    });

    expect(redactedTweet).toMatchInlineSnapshot(`
      {
        "details": {
          "author_id": "456",
          "conversation_id": "789",
          "created_at": 2024-01-01T00:00:00.000Z,
        },
        "entities": {
          "hashtags": [],
          "media": [],
          "mentions": [
            {
              "end": 0,
              "id": "123",
              "start": 0,
              "username": "*****************",
            },
          ],
          "urls": [
            {
              "display_url": "https://redacted.com/",
              "expanded_url": "https://example.com",
              "url": "https://redacted.com/",
            },
          ],
        },
        "id": "123",
        "metrics": {},
        "text": "****** ******",
        "type": "tweet",
      }
    `);
  });

  it("can redact primative arrays", () => {
    interface WithPrimativeArray {
      phoneNumbers: string[];
    }

    const redactor =
      NestedFieldsRedactor.builder().createRedactor<WithPrimativeArray>({
        strings: {
          phoneNumbers: asterixOut,
        },
      });

    const redacted = redactor({
      phoneNumbers: ["123 456 7890", "098 765 4321"],
    });

    expect(redacted).toMatchInlineSnapshot(`
      {
        "phoneNumbers": [
          "*** *** ****",
          "*** *** ****",
        ],
      }
    `);
  });

  it("only applies string redactors to string fields", () => {
    interface WithStringFields {
      field: string;
      nested: {
        field: number;
      };
    }

    const redactor =
      NestedFieldsRedactor.builder().createRedactor<WithStringFields>({
        strings: {
          field: asterixOut,
        },
      });

    const redacted = redactor({
      field: "hello",
      nested: {
        field: 123,
      },
    });

    expect(redacted).toMatchInlineSnapshot(`
      {
        "field": "*****",
        "nested": {
          "field": 123,
        },
      }
    `);
  });

  it("prefers explict redactors to pattern based redactors", () => {
    interface WithStringFields {
      field: string;
    }

    const redactor = NestedFieldsRedactor.builder()
      .withPatternBasedStringRedactor(redactKey("field", asterixOut))
      .createRedactor<WithStringFields>({
        strings: {
          field: () => "Hello World",
        },
      });

    const redacted = redactor({
      field: "Some Text",
    });

    expect(redacted).toMatchInlineSnapshot(`
      {
        "field": "Hello World",
      }
    `);
  });

  it("preserves null vs undefined vs absent", () => {
    interface EdgeCases {
      null: null;
      undefined: undefined;
      missing?: never;
    }

    const redactor = NestedFieldsRedactor.builder().createRedactor<EdgeCases>({
      strings: {},
    });

    const redacted = redactor({
      null: null,
      undefined: undefined,
    });

    expect(redacted).toMatchInlineSnapshot(`
      {
        "null": null,
        "undefined": undefined,
      }
    `);
  });

  it("preserves functions, symbols and booleans", () => {
    interface WithFunctions {
      fn: () => string;
      bool: boolean;
      symbol: symbol;
    }

    const redactor =
      NestedFieldsRedactor.builder().createRedactor<WithFunctions>({
        strings: {},
      });

    const redacted = redactor({
      fn: () => "hello",
      bool: true,
      symbol: Symbol("hello"),
    });

    expect(redacted).toMatchInlineSnapshot(`
      {
        "bool": true,
        "fn": [Function],
        "symbol": Symbol(hello),
      }
    `);
  });

  it("drops non-enumerable properties", () => {
    class MyClass {
      public secret = "hello";

      public helloWorld() {
        return "hi";
      }
    }

    const redactor = NestedFieldsRedactor.builder().createRedactor<MyClass>({
      strings: {
        secret: asterixOut,
      },
    });

    const redacted = redactor(new MyClass());

    expect(redacted).toMatchInlineSnapshot(`
      {
        "secret": "*****",
      }
    `);
  });

  // Returning the original object preserve performance, particularly when nesting redactors
  it("returns the original object if no redactors apply", () => {
    interface AnObject {
      field1: string;
      nested: {
        field2: number;
        nestedArray: Array<{
          field3: boolean;
        }>;
        nullValue: null;
      };
    }

    const redactor = NestedFieldsRedactor.builder().createRedactor<AnObject>({
      strings: {
        field1: doNotRedact,
      },
    });

    const original = {
      field1: "Some Text",
      nested: {
        field2: 123,
        nestedArray: [
          {
            field3: true,
          },
        ],
        nullValue: null,
      },
    };
    const redacted = redactor(original);

    expect(redacted).toEqual(original);
    expect(redacted).toBe(original);
  });
});

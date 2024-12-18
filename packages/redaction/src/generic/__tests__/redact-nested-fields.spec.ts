import { asterixOut } from "../asterix-out";
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
    const redactor = NestedFieldsRedactor.create().createRedactor<Tweet>({
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
      NestedFieldsRedactor.createWithDefaults().createRedactor<Tweet>({
        strings: {
          tag: doNotRedact,
          media_key: doNotRedact,
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
              "expanded_url": "https://redacted.com/",
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
});

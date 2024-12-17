import { asterixOut } from "../asterix-out";
import { redactNestedFields } from "../redact-nested-fields/redact-nested-fields";
import { Tweet } from "./typings/twitter-example";

describe("redactNestedFields", () => {
  it("should redact nested fields", () => {
    const doNotRedact = <T>(value: T): T => value;

    // Idea is we have a large set of default redactors that are shared across most endpoints,
    // and we only need to specify redactors on a per-endpoint basis if they have fields with
    // names that are not in the default set.
    const DEFAULT_REDACTORS = {
      id: doNotRedact,
    };

    // The below code will give a compile time error if you miss a field, even if that field is deeply nested
    // inside the object. But it'll only force you to redact string and Date fields
    // (and won't force for type union string fields like `"tweet" | "retweet"`).
    //
    // If you use redactNestedFieldsIncludingNumbers it'll force you to redact number too.
    const redactor = redactNestedFields<Tweet>({
      ...DEFAULT_REDACTORS,
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
              "id": "123",
              "start": 0,
              "username": "*****************",
            },
          ],
          "urls": [],
        },
        "id": "123",
        "metrics": {},
        "text": "****** ******",
        "type": "tweet",
      }
    `);
  });
});

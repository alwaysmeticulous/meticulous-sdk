import { describe, expect, it } from "vitest";
import type { ResolvedOptions } from "../../types";
import { buildScriptTag } from "../snippet";

const baseOptions: ResolvedOptions = {
  recordingToken: "tok",
  enabled: "always",
  inject: "auto",
  placeholderAttribute: "data-meticulous",
  snippetUrl: "https://snippet.meticulous.ai/v1/meticulous.js",
  attributes: {},
};

describe("buildScriptTag", () => {
  it("emits the standard recorder attributes in non-production builds", () => {
    expect(
      buildScriptTag(baseOptions, { isProduction: false }),
    ).toMatchInlineSnapshot(
      `"<script data-recording-token="tok" data-is-production-environment="false" src="https://snippet.meticulous.ai/v1/meticulous.js"></script>"`,
    );
  });

  it("emits data-is-production-environment=\"true\" in production builds", () => {
    expect(
      buildScriptTag(baseOptions, { isProduction: true }),
    ).toMatchInlineSnapshot(
      `"<script data-recording-token="tok" data-is-production-environment="true" src="https://snippet.meticulous.ai/v1/meticulous.js"></script>"`,
    );
  });

  it("HTML-escapes attribute values", () => {
    const out = buildScriptTag(
      {
        ...baseOptions,
        recordingToken: 'evil"<>&value',
      },
      { isProduction: false },
    );
    expect(out).toContain(
      'data-recording-token="evil&quot;&lt;&gt;&amp;value"',
    );
    expect(out).not.toContain('"<>');
  });

  it("emits boolean-true attributes without a value and skips false/null/undefined", () => {
    const out = buildScriptTag(
      {
        ...baseOptions,
        attributes: {
          async: true,
          defer: false,
          nonce: "abc",
          extra: null,
          missing: undefined,
        },
      },
      { isProduction: false },
    );
    // `async` is emitted as a bare boolean attribute (no `=`).
    expect(out).toMatch(/\sasync(\s|>)/);
    expect(out).not.toMatch(/async="/);
    expect(out).toContain(' nonce="abc"');
    expect(out).not.toContain("defer");
    expect(out).not.toContain("extra");
    expect(out).not.toContain("missing");
  });

  it("lets user attributes override defaults (data-is-production-environment, src)", () => {
    const out = buildScriptTag(
      {
        ...baseOptions,
        attributes: {
          "data-is-production-environment": "maybe",
          src: "https://example.test/snippet.js",
        },
      },
      { isProduction: false },
    );
    expect(out).toContain('data-is-production-environment="maybe"');
    expect(out).not.toContain('data-is-production-environment="false"');
    expect(out).toContain('src="https://example.test/snippet.js"');
    expect(out).not.toContain("snippet.meticulous.ai");
  });

  it("silently skips attributes with invalid names", () => {
    const out = buildScriptTag(
      {
        ...baseOptions,
        attributes: {
          "foo bar": "baz",
          'evil"name': "bad",
          "data-ok": "yes",
        },
      },
      { isProduction: false },
    );
    expect(out).not.toContain("foo bar");
    expect(out).not.toContain("evil");
    expect(out).toContain('data-ok="yes"');
  });
});

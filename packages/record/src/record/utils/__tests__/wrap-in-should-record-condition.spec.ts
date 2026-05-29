import { describe, expect, it } from "vitest";
import { wrapInShouldRecordCondition } from "../wrap-in-should-record-condition";

describe("wrapInShouldRecordCondition", () => {
  it("adds the desired condition and keeps the source map comment as the last line", () => {
    expect(
      wrapInShouldRecordCondition(
        [
          "console.log('Hello World')",
          "//# sourceMappingURL=main.bundle.js.map",
          "",
        ].join("\n")
      )
    ).toMatchInlineSnapshot(`
      "(function() {
        var __meticulousRunRecorder = function() {
      if (window.origin !== 'null' && !["https://app.meticulous.ai/docs/recording-a-test","https://app.meticulous.ai/docs/recording-a-login-flow","https://app.meticulous.ai/docs/recording-a-login-flow-saving"].includes(window.document.location.toString()) && !["chrome://","chrome-error://","about:"].some((protocol) => window.document.location.toString().startsWith(protocol))) {
      console.log('Hello World')
      }
        };
        if (document.documentElement) {
          __meticulousRunRecorder();
        } else {
          var __meticulousRootObserver = new MutationObserver(function() {
            if (document.documentElement) {
              __meticulousRootObserver.disconnect();
              __meticulousRunRecorder();
            }
          });
          __meticulousRootObserver.observe(document, { childList: true });
        }
      })();
      //# sourceMappingURL=main.bundle.js.map
      "
    `);
  });

  it("defers via the root-element observer when there is no source map comment", () => {
    expect(
      wrapInShouldRecordCondition("console.log('Hello World')")
    ).toMatchInlineSnapshot(`
      "(function() {
        var __meticulousRunRecorder = function() {
      if (window.origin !== 'null' && !["https://app.meticulous.ai/docs/recording-a-test","https://app.meticulous.ai/docs/recording-a-login-flow","https://app.meticulous.ai/docs/recording-a-login-flow-saving"].includes(window.document.location.toString()) && !["chrome://","chrome-error://","about:"].some((protocol) => window.document.location.toString().startsWith(protocol))) {
      console.log('Hello World')
      }
        };
        if (document.documentElement) {
          __meticulousRunRecorder();
        } else {
          var __meticulousRootObserver = new MutationObserver(function() {
            if (document.documentElement) {
              __meticulousRootObserver.disconnect();
              __meticulousRunRecorder();
            }
          });
          __meticulousRootObserver.observe(document, { childList: true });
        }
      })();"
    `);
  });

  it("runs the recorder immediately once documentElement exists", () => {
    const wrapped = wrapInShouldRecordCondition("console.log('Hello World')");
    expect(wrapped).toContain("if (document.documentElement) {");
    expect(wrapped).toContain(
      "__meticulousRootObserver.observe(document, { childList: true });"
    );
    expect(wrapped).not.toContain("DOMContentLoaded");
  });
});

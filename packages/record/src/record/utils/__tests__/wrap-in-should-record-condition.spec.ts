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
      "if (window === window.parent && !["https://app.meticulous.ai/docs/recording-a-test","https://app.meticulous.ai/docs/recording-a-login-flow","https://app.meticulous.ai/docs/recording-a-login-flow-saving"].includes(window.document.location.toString()) && !["chrome://","chrome-error://"].some((protocol) => window.document.location.toString().startsWith(protocol))) {
      console.log('Hello World')
      }
      //# sourceMappingURL=main.bundle.js.map
      "
    `);
  });
});

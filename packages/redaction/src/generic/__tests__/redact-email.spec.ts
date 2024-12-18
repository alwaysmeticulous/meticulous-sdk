import { redactEmail } from "../redact-email";

describe("redactEmail", () => {
  it("redacts an email", () => {
    expect(redactEmail("test@example.com")).toMatchInlineSnapshot(
      `"----@-------.com"`
    );
  });
});

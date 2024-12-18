import { redactString } from "../redact-string";

describe("redactString", () => {
  it("redacts emails correctly", () => {
    expect(redactString("test@example.com")).toMatchInlineSnapshot(
      `"----@-------.com"`
    );
  });

  it("redacts URLs correctly", () => {
    expect(redactString("https://example.com")).toMatchInlineSnapshot(
      `"https://redacted.com/"`
    );
  });

  it("redacts ISO 8601 timestamps correctly", () => {
    expect(redactString("2024-01-01T00:00:00.000Z")).toMatchInlineSnapshot(
      `"1970-01-01T00:00:00.000Z"`
    );
  });

  it("redacts unknown strings correctly", () => {
    expect(redactString("unknown")).toMatchInlineSnapshot(`"*******"`);
  });

  it("redacts phone numbers correctly", () => {
    expect(redactString("123 456 7890")).toMatchInlineSnapshot(
      `"000 000 0000"`
    );
  });

  it("redacts id numbers correctly", () => {
    expect(redactString("123/456/7890")).toMatchInlineSnapshot(
      `"000/000/0000"`
    );

    expect(redactString("#123")).toMatchInlineSnapshot(`"#000"`);
  });

  it("redacts decimal numbers correctly", () => {
    expect(redactString("12345678.90")).toMatchInlineSnapshot(`"00000000.00"`);
  });

  it("redacts credit card numbers correctly", () => {
    expect(redactString("1234-5678-9012-3456")).toMatchInlineSnapshot(
      `"0000-0000-0000-0000"`
    );
  });
});

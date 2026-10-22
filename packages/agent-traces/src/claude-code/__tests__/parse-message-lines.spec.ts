import { describe, expect, it } from "vitest";
import { parseUserLine } from "../parse-message-lines";

const userLine = (origin?: Record<string, unknown>) => ({
  type: "user",
  uuid: "u1",
  message: { role: "user", content: "Fix the checkout bug" },
  ...(origin ? { origin } : {}),
});

describe("parseUserLine", () => {
  it("keeps the origin of an injected message", () => {
    expect(
      parseUserLine(userLine({ kind: "task-notification" }))?.originKind,
    ).toBe("task-notification");
  });

  it("treats a prompt marked human as typed by the user", () => {
    expect(parseUserLine(userLine({ kind: "human" }))?.originKind).toBeNull();
  });

  it("treats a prompt without an origin as typed by the user", () => {
    expect(parseUserLine(userLine())?.originKind).toBeNull();
  });
});

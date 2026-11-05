import { describe, expect, it } from "vitest";
import { formatSimulatedUserEvent } from "../format-simulated-user-event";

const pathTo = (leaf: Record<string, unknown>) => ({
  type: "path",
  path: [{ tagName: "DIV" }, leaf],
});

describe("formatSimulatedUserEvent", () => {
  it("names the element a successful event was replayed on, with its confidence", () => {
    expect(
      formatSimulatedUserEvent({
        event: "simulate",
        result: "success",
        userEvent: { type: "click", selector: "#old" },
        matchQuality: {
          confidence: 0.931,
          type: "full-match",
          nodeIdentifier: pathTo({
            tagName: "BUTTON",
            id: "save",
            attrs: { "aria-label": "Save", class: "x1" },
            truncatedInnerText: "  Save\n changes ",
          }),
        },
      }),
    ).toBe(
      'click result=success conf=0.93 target=button#save[aria-label=Save] "Save changes"',
    );
  });

  it("names the recorded target and the reason for a failed event", () => {
    expect(
      formatSimulatedUserEvent({
        event: "simulate",
        result: "failed",
        userEvent: {
          type: "pointerdown",
          selector: "#menu",
          nodeIdentifier: pathTo({ tagName: "LI", attrs: { role: "option" } }),
        },
        matchQuality: {
          confidence: 0.4,
          type: "no-match-obscured",
          nodeIdentifier: pathTo({ tagName: "SPAN" }),
        },
      }),
    ).toBe(
      "pointerdown result=failed conf=0.40 reason=no-match-obscured target=li[role=option]",
    );
  });

  it("shows the key and modifiers of a keyboard event, falling back to the selector", () => {
    expect(
      formatSimulatedUserEvent({
        event: "simulate",
        result: "success",
        userEvent: {
          type: "keydown",
          key: "x",
          ctrlKey: true,
          shiftKey: false,
          selector: "div.editor > textarea",
        },
      }),
    ).toBe("keydown key=Ctrl+x result=success target=div.editor > textarea");
  });

  it("names a pressed modifier key once", () => {
    const keydown = (userEvent: Record<string, unknown>) =>
      formatSimulatedUserEvent({
        event: "simulate",
        result: "success",
        userEvent: { type: "keydown", ...userEvent },
      });

    expect(keydown({ key: "Control", ctrlKey: true })).toBe(
      "keydown key=Ctrl result=success",
    );
    expect(keydown({ key: "Shift", ctrlKey: true, shiftKey: true })).toBe(
      "keydown key=Ctrl+Shift result=success",
    );
  });
});

import type { TimelineEventDetails } from "@alwaysmeticulous/client";
import { describe, expect, it } from "vitest";
import {
  formatTimelineEvent,
  formatTimelineEventDiff,
} from "../timeline-event.utils";

const USER_EVENT: TimelineEventDetails = {
  eventId: "user:3",
  timeMs: 1200,
  kind: "user",
  entryKind: "jsReplay",
  user: {
    type: "click",
    result: "success",
    confidence: 0.98765,
    coordinates: { x: 10, y: 20 },
    target: "button#save",
    path: [
      { marker: " ", element: "div#root", score: "1/1" },
      { marker: "-", element: "span.icon", narrowing: "by text" },
      {
        marker: " ",
        element: 'button:nth(1)[type="submit"] text="Save"',
        score: "2/4: nthChild 1, tagName 1, attributes 0, text 0",
        matched: 'button:nth(1)[type="button"] text="Save changes"',
      },
    ],
  },
};

describe("formatTimelineEvent", () => {
  it("keys every line by its --json path", () => {
    expect(formatTimelineEvent(USER_EVENT)).toEqual([
      "eventId:\tuser:3",
      "timeMs:\t1200",
      "kind:\tuser",
      "entryKind:\tjsReplay",
      "user.type:\tclick",
      "user.result:\tsuccess",
      "user.confidence:\t0.988",
      "user.coordinates.x:\t10",
      "user.coordinates.y:\t20",
      "user.target:\tbutton#save",
      "user.path[0]:\tdiv#root (score 1/1)",
      "user.path[1]:\t- span.icon (by text)",
      'user.path[2]:\tbutton:nth(1)[type="submit"] text="Save" (score 2/4: nthChild 1, tagName 1, attributes 0, text 0; matched: button:nth(1)[type="button"] text="Save changes")',
    ]);
  });

  it("keeps multi-line values on one line", () => {
    const lines = formatTimelineEvent({
      eventId: "idx:4",
      timeMs: 5,
      kind: "error",
      entryKind: "error",
      message: { message: "boom", stack: "  at a.js:1:2\n  at b.js:3:4" },
      network: {
        method: "GET",
        url: "/api",
        outcome: "matched",
        transformationsApplied: ["a", "b"],
      },
    });

    expect(lines).toContain("message.stack:\t  at a.js:1:2 at b.js:3:4");
    expect(lines).toContain("network.transformationsApplied:\ta,b");
  });
});

describe("formatTimelineEventDiff", () => {
  it("marks each differing field like a timeline-diff row", () => {
    const lines = formatTimelineEventDiff({
      eventId: "user:3",
      fields: [
        {
          diff: "changed",
          field: "user.result",
          base: "success",
          head: "failed",
        },
        {
          diff: "changed",
          field: "user.path[27]",
          base: { marker: "-", element: "div", score: "0/3" },
          head: { marker: " ", element: "div", score: "2.3/3" },
        },
        {
          diff: "changed",
          field: "user.path[28]",
          base: { marker: " ", element: "button", score: "4/4" },
          head: {
            marker: " ",
            element: "button",
            score: "1/4",
            matched: "div.empty",
          },
        },
        { diff: "removed", field: "user.coordinates.x", base: 10 },
        { diff: "added", field: "user.confidence", head: 0.42 },
        { diff: "identical", field: "user.type", base: "click", head: "click" },
      ],
    });

    expect(lines).toEqual([
      "eventId:\tuser:3",
      "! user.result:\tsuccess -> failed",
      "! user.path[27]:\tdiv (skipped -> paired; score 0/3 -> 2.3/3)",
      "! user.path[28]:\tbutton (score 4/4 -> 1/4; matched: same -> div.empty)",
      "- user.coordinates.x:\t10",
      "+ user.confidence:\t0.420",
      "  user.type:\tclick",
    ]);
  });

  // 0.8635 and 0.8638 both print as 0.864 at the usual three digits.
  it("gives a changed number the digits that tell the sides apart", () => {
    expect(
      formatTimelineEventDiff({
        eventId: "user:3",
        fields: [
          {
            diff: "changed",
            field: "user.confidence",
            base: 0.8635,
            head: 0.8638,
          },
        ],
      }),
    ).toContain("! user.confidence:\t0.8635 -> 0.8638");
  });
});

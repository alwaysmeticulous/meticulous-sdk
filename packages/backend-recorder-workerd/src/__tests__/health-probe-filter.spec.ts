import { describe, expect, it } from "vitest";
import { HealthProbeEventFilter } from "../health-probe-filter";
import type {
  CaptureEvent,
  InboundRequestEvent,
  OutboundRequestEvent,
  PostgresQueryEvent,
} from "../protocol";

const inbound = (
  overrides: Partial<InboundRequestEvent> & { requestId: string },
): InboundRequestEvent => ({
  kind: "inbound",
  method: "GET",
  url: "http://worker.local/health",
  requestHeaders: {},
  statusCode: 200,
  startTimeMs: 1_000,
  endTimeMs: 1_005,
  ...overrides,
});

const outbound = (requestId: string, url: string): OutboundRequestEvent => ({
  kind: "outbound",
  requestId,
  method: "GET",
  url,
  requestHeaders: {},
  statusCode: 200,
  startTimeMs: 1_001,
  endTimeMs: 1_003,
});

const postgres = (requestId: string): PostgresQueryEvent => ({
  kind: "postgres",
  requestId,
  queryText: "SELECT 1",
  params: "[]",
  rowMode: "",
  startTimeMs: 1_001,
  endTimeMs: 1_002,
});

const kindsAndIds = (events: CaptureEvent[]) =>
  events.map((event) => `${event.kind}:${event.requestId}`);

describe("HealthProbeEventFilter", () => {
  it("drops a probe's inbound event and everything correlated with it", () => {
    const filter = new HealthProbeEventFilter();

    const kept = filter.filter([
      inbound({ requestId: "probe" }),
      outbound("probe", "http://upstream.local/ping"),
      postgres("probe"),
    ]);

    expect(kept).toEqual([]);
  });

  it("keeps another request's events from the same batch", () => {
    const filter = new HealthProbeEventFilter();

    const kept = filter.filter([
      inbound({ requestId: "probe" }),
      postgres("probe"),
      inbound({
        requestId: "real",
        url: "http://worker.local/page",
        frontendSessionId: "fs-1",
        requestHeaders: { "x-meticulous-session-id": ["fs-1"] },
      }),
      postgres("real"),
    ]);

    expect(kindsAndIds(kept)).toEqual(["inbound:real", "postgres:real"]);
  });

  // Events the app queued in waitUntil are sent after the buffer closes, so they arrive in
  // their own batch with no inbound event to judge them by.
  it("drops stragglers that arrive in a later batch", () => {
    const filter = new HealthProbeEventFilter();

    filter.filter([inbound({ requestId: "probe" })]);
    const kept = filter.filter([outbound("probe", "http://upstream.local/x")]);

    expect(kept).toEqual([]);
  });

  it("returns the input array untouched when nothing is dropped", () => {
    const filter = new HealthProbeEventFilter();
    const events: CaptureEvent[] = [
      inbound({ requestId: "real", url: "http://worker.local/page" }),
      postgres("real"),
    ];

    expect(filter.filter(events)).toBe(events);
  });

  it("keeps a probe path the app served to a session", () => {
    const filter = new HealthProbeEventFilter();
    const events: CaptureEvent[] = [
      inbound({
        requestId: "real",
        url: "http://worker.local/api/health",
        frontendSessionId: "fs-1",
        requestHeaders: { "x-meticulous-session-id": ["fs-1"] },
      }),
      postgres("real"),
    ];

    expect(filter.filter(events)).toBe(events);
  });

  // A backend-minted id says the shim tagged a document navigation, not that the caller
  // identified itself, so it must not shield a probe from the drop.
  it("still drops a probe carrying only a backend-minted session id", () => {
    const filter = new HealthProbeEventFilter();

    const kept = filter.filter([
      inbound({
        requestId: "probe",
        frontendSessionId: "2026-08-26T00:00:00.000Z_abc",
        sessionIdOrigin: "backend",
      }),
    ]);

    expect(kept).toEqual([]);
  });

  it("keeps a session-tagged request even if only the header survived", () => {
    const filter = new HealthProbeEventFilter();
    const events: CaptureEvent[] = [
      inbound({
        requestId: "real",
        requestHeaders: { "x-meticulous-session-id": ["fs-1"] },
      }),
    ];

    expect(filter.filter(events)).toBe(events);
  });

  it("evicts the oldest remembered request id past the bound", () => {
    const filter = new HealthProbeEventFilter({ maxRememberedRequestIds: 2 });

    filter.filter([inbound({ requestId: "p1" })]);
    filter.filter([inbound({ requestId: "p2" })]);
    filter.filter([inbound({ requestId: "p3" })]);

    // p1 has aged out, so its straggler is recorded; p2 and p3 are still remembered.
    expect(kindsAndIds(filter.filter([outbound("p1", "http://x/1")]))).toEqual([
      "outbound:p1",
    ]);
    expect(filter.filter([outbound("p2", "http://x/2")])).toEqual([]);
    expect(filter.filter([outbound("p3", "http://x/3")])).toEqual([]);
  });

  it("refreshes a remembered id so an active request does not age out", () => {
    const filter = new HealthProbeEventFilter({ maxRememberedRequestIds: 2 });

    filter.filter([inbound({ requestId: "p1" })]);
    filter.filter([inbound({ requestId: "p2" })]);
    // Re-asserting p1 makes p2 the oldest instead.
    filter.filter([inbound({ requestId: "p1" })]);
    filter.filter([inbound({ requestId: "p3" })]);

    expect(filter.filter([outbound("p1", "http://x/1")])).toEqual([]);
    expect(kindsAndIds(filter.filter([outbound("p2", "http://x/2")]))).toEqual([
      "outbound:p2",
    ]);
  });
});

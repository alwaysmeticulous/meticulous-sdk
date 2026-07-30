import { warnOnce } from "./log";
import {
  type CaptureEvent,
  type CaptureEventsPayload,
  SIDECAR_EVENTS_PATH,
  SIDECAR_PROTOCOL_VERSION,
  SIDECAR_PROTOCOL_VERSION_HEADER,
} from "./protocol";

type FetchFn = typeof globalThis.fetch;

/** POSTs capture events to the sidecar. Never rejects — reporting failures only warn (once). */
export const postCaptureEvents = async (
  fetchFn: FetchFn,
  sidecarUrl: string,
  events: CaptureEvent[],
): Promise<void> => {
  try {
    const payload: CaptureEventsPayload = { events };
    const response = await fetchFn(`${sidecarUrl}${SIDECAR_EVENTS_PATH}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [SIDECAR_PROTOCOL_VERSION_HEADER]: SIDECAR_PROTOCOL_VERSION,
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      warnOnce(
        "sidecar-rejected",
        `Meticulous sidecar rejected capture events (HTTP ${response.status}).`,
      );
    }
    await response.arrayBuffer().catch(() => undefined);
  } catch (error) {
    warnOnce(
      "sidecar-unreachable",
      "Could not reach the Meticulous backend recorder sidecar — backend session events are not being recorded.",
      error,
    );
  }
};

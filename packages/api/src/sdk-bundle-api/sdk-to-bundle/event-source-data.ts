import { SequenceNumber } from "./websocket-data";

export interface EventSourceConnectionData {
  id: SequenceNumber;
  url: string;
  withCredentials: boolean;
  events: EventSourceConnectionEvent[];
}

export type EventSourceConnectionEvent =
  | EventSourceConnectionCreatedEvent
  | EventSourceConnectionOpenedEvent
  | EventSourceConnectionMessageEvent
  | EventSourceConnectionErrorEvent
  | EventSourceConnectionClosedEvent;

export interface EventSourceConnectionGenericEvent {
  /** Timestamp in milliseconds since session start (performance.now()) */
  timestamp: number;
  type: unknown;
}

export interface EventSourceConnectionCreatedEvent
  extends EventSourceConnectionGenericEvent {
  type: "created";
}

export interface EventSourceConnectionOpenedEvent
  extends EventSourceConnectionGenericEvent {
  type: "opened";
}

export interface EventSourceConnectionMessageEvent
  extends EventSourceConnectionGenericEvent {
  type: "message-received";
  data: {
    /** The event type (e.g., "message" for unnamed events, or custom event names) */
    eventType: string;
    /** The data payload from the SSE message */
    data: string;
    /** Optional last event ID from the SSE stream */
    lastEventId?: string;
  };
}

export interface EventSourceConnectionErrorEvent
  extends EventSourceConnectionGenericEvent {
  type: "error";
}

export interface EventSourceConnectionClosedEvent
  extends EventSourceConnectionGenericEvent {
  type: "closed";
}

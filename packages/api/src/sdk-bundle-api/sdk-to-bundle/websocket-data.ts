export interface WebSocketConnectionData {
  id: SequenceNumber;
  url: string;
  events: WebSocketConnectionEvent[];
}

export type SequenceNumber = number;

export type WebSocketConnectionEvent =
  | WebSocketConnectionCreatedEvent
  | WebSocketConnectionOpenedEvent
  | WebSocketConnectionMessageEvent
  | WebSocketConnectionErrorEvent
  | WebSocketConnectionClosedEvent;

export interface WebSocketConnectionGenericEvent {
  /**
   * The time in milliseconds since the start of the session.
   *
   * During simulations, we consider the "created" event to have been replayed whenever the browser calls
   * `new WebSocket()` and all other events are replayed at a time relative to the "created" event's timestamp.
   *
   * E.g. the "opened" event is replayed at ("opened".timestamp - "created".timestamp) milliseconds after the browser calls `new WebSocket()`.
   */
  timestamp: number;
  type: unknown;
  data?: unknown;
}

export interface WebSocketConnectionCreatedEvent
  extends WebSocketConnectionGenericEvent {
  type: "created";
}

export interface WebSocketConnectionOpenedEvent
  extends WebSocketConnectionGenericEvent {
  type: "opened";
}

export interface WebSocketConnectionMessageEvent
  extends WebSocketConnectionGenericEvent {
  type: "message-sent" | "message-received";
  data: string;

  /**
   * If set, indicates that the `data` field is base64 encoded binary data originally of the given type.
   */
  binaryType?: BinaryType;
}

export interface WebSocketConnectionErrorEvent
  extends WebSocketConnectionGenericEvent {
  type: "error";
}

export interface WebSocketConnectionClosedEvent
  extends WebSocketConnectionGenericEvent {
  type: "closed";
  data: {
    code: number;
    reason: string;
    wasClean: boolean;
  };
}

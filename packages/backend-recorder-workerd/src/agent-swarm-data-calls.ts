/**
 * Agent-swarm-testing data calls: the database, cache and wrapped-operation calls a Node
 * backend running `@alwaysmeticulous/backend-recorder-js` offers the interceptor, so an
 * installed be-mock's `interceptCall` answers them instead of the real service. The workerd
 * shim offers none of them. All of it is additive, so `SIDECAR_PROTOCOL_VERSION` (compared by
 * strict equality) is unchanged.
 */

import type { PostgresJsRowMode } from "./postgres/capture";

/**
 * Env var the Node recorder reads in agent-swarm-testing mode. `consult` offers every data
 * call made for a routed request to the interceptor, and fails a call nobody answers rather
 * than reaching the real service. `live`, the default, leaves the clients untouched.
 */
export const AGENT_SWARM_TESTING_DATA_CALLS_ENV_KEY =
  "METICULOUS_AGENT_SWARM_TESTING_DATA_CALLS";

export type AgentSwarmTestingDataCallsMode = "consult" | "live";

/**
 * Agent-swarm-testing route the Node recorder `POST`s one
 * {@link OutboundCallAgentSwarmTestingRequest} to, answered with
 * {@link OutboundCallAgentSwarmTestingResponse}.
 */
export const SIDECAR_AGENT_SWARM_TESTING_OUTBOUND_CALL_PATH =
  "/v1/agent-swarm-testing/outbound-call";

/**
 * One data call, as exactly the input replay keys its match on: each field is serialized the
 * way the recorder records it, so the interceptor can record the call as a recording would
 * hold it and look it up in replay's own mock stores.
 */
export type AgentSwarmTestingDataCall =
  | {
      technology: "pg";
      text: string;
      /** `serializePgQueryValues` of the query's values. */
      valuesJson: string;
      /** Set when the query asked node-postgres for array rows. */
      rowMode?: "array";
    }
  | {
      technology: "postgres-js";
      /** The SQL text, with `$1`-style placeholders (`reconstructQueryText`). */
      text: string;
      /** `serializePostgresJsArgs` of the query's interpolated values. */
      paramsJson: string;
      rowMode: PostgresJsRowMode;
    }
  | {
      technology: "prisma";
      /** Absent for `$queryRaw` and the other raw operations. */
      model?: string;
      operation: string;
      /** `serializePrismaArgs` of the operation's arguments. */
      argsJson: string;
    }
  | {
      technology: "ioredis";
      /** As ioredis names the command. */
      command: string;
      /** `serializeIORedisArgs` of the command's flattened arguments. */
      argsJson: string;
    }
  | {
      technology: "custom";
      name: string;
      /** `serializeCustomOperationKey` of the operation's key. */
      keyJson: string;
      /**
       * True when the app serves the answer as a promise (its wrapped function is declared
       * `async`), so the call is recorded as an asynchronous one.
       */
      async?: boolean;
    };

export type AgentSwarmTestingDataCallTechnology =
  AgentSwarmTestingDataCall["technology"];

/** One data call offered to the interceptor, with the identity it routes by. */
export type OutboundCallAgentSwarmTestingRequest = AgentSwarmTestingDataCall & {
  runId: string;
  /** The page session the call is recorded under, when known. */
  frontendSessionId?: string;
  /** The be-mock the call is offered to, when it is not the one installed under the session. */
  beMockId?: string;
};

/**
 * What the call returns, in the attribute format a recording of it stores: the recorder
 * serves `deserializeX(resultJson)` exactly as replay would. There is no passthrough: a call
 * nobody answers fails in the backend, so it never reaches the real service.
 */
export type OutboundCallAgentSwarmTestingResponse =
  | {
      outcome: "result";
      resultJson: string;
      /**
       * A custom operation answered from a recording: whether the recorded call returned a
       * promise. Absent for everything else.
       */
      async?: boolean;
    }
  | {
      /** A postgres.js query or custom operation that throws: its recorded error format. */
      outcome: "error";
      errorJson: string;
      async?: boolean;
    }
  | { outcome: "unanswered"; reason: string };

/**
 * The call as an installed be-mock's `interceptCall` receives it: the serialized arguments
 * parsed back into values. Mirrors `BeMockDataCall` in the agentic session-generation
 * worker's `libs/be-mock.d.ts`.
 */
export type BeMockDataCall = { runId: string; frontendSessionId?: string } & (
  | { technology: "pg"; text: string; values: unknown[] }
  | { technology: "postgres-js"; text: string; params: unknown[] }
  | {
      technology: "prisma";
      model?: string;
      operation: string;
      args: unknown;
    }
  | { technology: "ioredis"; command: string; args: unknown[] }
  | { technology: "custom"; name: string; key: unknown }
);

/**
 * An answer as the be-mock sandbox's `interceptCall` hands it to the sidecar: which helper
 * built it, and its value encoded by `serializeCapturedResult`, because the sandbox's RPC
 * carries JSON and would lose Date, bigint and binary values. An unanswered call crosses as
 * `null`.
 */
export type BeMockDataCallAnswer =
  | {
      beMockDataAnswer: true;
      answer: "sqlRows";
      /** Encodes `{ rows, command?, rowCount? }`. */
      valueJson: string;
    }
  | {
      beMockDataAnswer: true;
      answer: "prismaResult" | "redisReply" | "operationResult";
      valueJson: string;
      /**
       * For a wrapped operation: its function returns the value directly. Otherwise the app
       * gets a promise.
       */
      sync?: true;
    }
  | {
      beMockDataAnswer: true;
      answer: "callError";
      message: string;
      code?: string;
      /** For a wrapped operation: its function throws. Otherwise its promise rejects. */
      sync?: true;
    };

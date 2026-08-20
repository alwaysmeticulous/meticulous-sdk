# Backend Recorder Launcher

Downloads the backend-recorder bundle script and executes it. The backend recorder intercepts HTTP requests/responses in Node.js apps using OpenTelemetry and exports spans to Meticulous.

## Setup

```bash
npm install @alwaysmeticulous/backend-recorder-launcher
```

### Option 1: Using `instrumentation.js` (recommended)

Create or update your `instrumentation.js` (or `instrumentation.ts`) file at the root of your project:

```js
const {
  initBackendRecorder,
} = require("@alwaysmeticulous/backend-recorder-launcher");

initBackendRecorder({
  recordingToken: process.env.METICULOUS_RECORDING_TOKEN,
});
```

Then start your app with the `--require` flag so the recorder is loaded before your application code:

```bash
node --require ./instrumentation.js app.js
```

If you are using Next.js, add the instrumentation hook in `instrumentation.ts`:

```ts
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initBackendRecorder } =
      await import("@alwaysmeticulous/backend-recorder-launcher");
    await initBackendRecorder({
      recordingToken: process.env.METICULOUS_RECORDING_TOKEN,
    });
  }
}
```

### Option 2: Auto-init (zero-code)

Use the `auto-init` entry point which initializes the recorder as a side effect. No code changes needed — just add the `--require` flag:

```bash
node --require @alwaysmeticulous/backend-recorder-launcher/auto-init app.js
```

The auto-init entry point reads configuration from environment variables.

## Configuration

`initBackendRecorder` accepts an optional `BackendRecorderConfig` object:

| Option                  | Type                            | Description                                                                    |
| ----------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `enabled`               | `boolean`                       | Enable/disable the recorder (default: `true`)                                  |
| `meticulousProjectName` | `string`                        | The name of the Meticulous project                                             |
| `recordingToken`        | `string`                        | Token used to authenticate span uploads                                        |
| `exportMode`            | `"local" \| "s3"`               | Where to export spans (default: `"local"`)                                     |
| `localOutputDir`        | `string`                        | Directory for local exports                                                    |
| `flushIntervalMs`       | `number`                        | How often to flush spans (ms)                                                  |
| `spanRedactionHooks`    | `((value: string) => string)[]` | Ordered record-time hooks that transform redactable span strings before upload |

### Redacting recorded backend data

Use `spanRedactionHooks` to replace sensitive values before completed spans are saved or uploaded.
Each hook receives every redactable string and must return a string. Hooks run in the order they are
provided.

```ts
await initBackendRecorder({
  recordingToken: process.env.METICULOUS_RECORDING_TOKEN,
  spanRedactionHooks: [
    (value) =>
      value.replace(/api_key=[A-Za-z0-9_-]+/g, "api_key=[REDACTED_API_KEY]"),
  ],
});
```

The hooks cover span names, error/status messages, and all span attribute values, including strings
inside arrays or objects and JSON captured inside strings. They do not transform attribute names,
trace/span/parent IDs, timestamps, span kind, client-technology routing, or frontend session IDs.

Hooks run only while recording. If a hook throws or returns a non-string, Meticulous abandons the
recording rather than saving the span without redaction. Replacing backend-generated request data
can also change a replay match key; use stable replacements and verify that the corresponding input
will have the same value during replay. This programmatic option applies to the Node.js recorder and
is not available to the Cloudflare Workers sidecar.

## Graceful shutdown

`initBackendRecorder` returns a `BackendRecorderHandle` with a `stopRecording()` method. Call it before your process exits to flush any pending spans:

```js
const handle = await initBackendRecorder({
  /* ... */
});

process.on("SIGTERM", async () => {
  await handle?.stopRecording();
  process.exit(0);
});
```
